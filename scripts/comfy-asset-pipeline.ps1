[CmdletBinding()]
param(
    [ValidateSet('Start', 'Status', 'Stop', 'Smoke', 'Prepare', 'StageInput')]
    [string]$Action = 'Status',
    [ValidateSet('sd15', 'flux2-klein')]
    [string]$Profile = 'sd15',
    [switch]$VerifyHashes,
    [switch]$Json,
    [string]$InputImage,
    [ValidatePattern('^[a-z0-9][a-z0-9._-]{0,63}\.(png|jpg|jpeg|webp)$')]
    [string]$StagedName = 'reference.png',
    [ValidateRange(10, 300)]
    [int]$TimeoutSeconds = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $RepoRoot 'legal\generation-component-manifest.json'
$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json

function Get-ConfiguredPath {
    param([string]$EnvironmentName, [string]$DefaultValue)
    $configured = [Environment]::GetEnvironmentVariable($EnvironmentName)
    if ([string]::IsNullOrWhiteSpace($configured)) { return $DefaultValue }
    return $configured
}

function Get-ManifestComponent {
    param([string]$Id)
    $matches = @($Manifest.components | Where-Object id -eq $Id)
    if ($matches.Count -ne 1) { throw "Generation manifest must contain exactly one component $Id." }
    return $matches[0]
}

function Get-ManifestProfile {
    param([string]$Id)
    $matches = @($Manifest.profiles | Where-Object id -eq $Id)
    if ($matches.Count -ne 1) { throw "Generation manifest must contain exactly one profile $Id." }
    if ($matches[0].runtime_enabled -ne $true) { throw "Generation profile $Id is not runtime-enabled." }
    return $matches[0]
}

$ComfyRoot = Get-ConfiguredPath 'WORMS_COMFY_ROOT' 'E:\ComFy\TasirWimp'
$McpRoot = Get-ConfiguredPath 'WORMS_COMFY_MCP_ROOT' (Join-Path $HOME 'Desktop\Projects\comfyui-mcp-server')
$SharedRoot = Get-ConfiguredPath 'WORMS_COMFY_SHARED_ROOT' (Join-Path $env:LOCALAPPDATA 'Comfy-Desktop\ComfyUI-Shared')
$ReviewedModelRoot = Get-ConfiguredPath 'WORMS_COMFY_REVIEWED_MODEL_ROOT' (Join-Path $ComfyRoot 'Worms_Port-models')
$DesktopSharedModelPaths = Get-ConfiguredPath 'WORMS_COMFY_DESKTOP_MODEL_PATHS' (Join-Path $env:APPDATA 'Comfy Desktop\shared_model_paths.yaml')
$McpConfigPath = Get-ConfiguredPath 'WORMS_COMFY_MCP_CONFIG' (Join-Path $HOME '.config\comfy-mcp\config.json')
$CodexConfigPath = Get-ConfiguredPath 'WORMS_CODEX_CONFIG' (Join-Path $HOME '.codex\config.toml')
$StateRoot = Join-Path $env:LOCALAPPDATA 'Worms_Port\comfy-pipeline'
$StatePath = Join-Path $StateRoot 'state.json'
$ComfyRepo = Join-Path $ComfyRoot 'ComfyUI'
$ComfyStarter = Join-Path $ComfyRoot 'start-comfy-api.bat'
$ComfyExtraModelPaths = Join-Path $ComfyRepo 'extra_model_paths.yaml'
$ComfyPython = Join-Path $ComfyRepo '.venv\Scripts\python.exe'
$ComfyMain = Join-Path $ComfyRepo 'main.py'
$McpPython = Join-Path $McpRoot '.venv\Scripts\python.exe'
$McpServer = Join-Path $McpRoot 'server.py'
$SmokeHelper = Join-Path $RepoRoot 'scripts\comfy-mcp-smoke.py'
$GenerationCheckPath = Join-Path $RepoRoot 'scripts\check-generation-components.js'
$ProfileDefinition = Get-ManifestProfile $Profile
$CheckpointComponent = Get-ManifestComponent 'stable-diffusion-v1-5-archive-fp16'
$ComfyComponent = Get-ManifestComponent 'comfyui'
$McpComponent = Get-ManifestComponent 'comfyui-mcp-server'
$ImageWorkflowComponent = Get-ManifestComponent 'comfyui-mcp-generate-image-workflow'
$ConditionedWorkflowComponent = Get-ManifestComponent 'wormsport-generate-image-conditioned-workflow'
$McpRequirementsLock = Join-Path $RepoRoot $McpComponent.requirements_lock
$ImageWorkflowPath = Join-Path $McpRoot $ImageWorkflowComponent.file_path
$ConditionedWorkflowSource = Join-Path $RepoRoot $ConditionedWorkflowComponent.source_path
$ConditionedWorkflowPath = Join-Path $McpRoot $ConditionedWorkflowComponent.runtime_path
$CheckpointPath = Join-Path (Join-Path $SharedRoot 'models\checkpoints') $CheckpointComponent.file_name
$ComfyInputRoot = Join-Path $SharedRoot 'input'
$ComfyOutputRoot = Join-Path $SharedRoot 'output'
$StagedInputRoot = Join-Path $ComfyInputRoot 'wormsport'

function Assert-RequiredFile {
    param([string]$Path, [string]$Label)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Label is missing: $Path"
    }
}

function Assert-RequiredDirectory {
    param([string]$Path, [string]$Label)
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "$Label is missing: $Path"
    }
}

function Assert-FileHash {
    param([string]$Path, [string]$ExpectedHash, [string]$Label)
    Assert-RequiredFile $Path $Label
    $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    if ($actualHash -ne $ExpectedHash) {
        throw "$Label hash mismatch. Expected $ExpectedHash, found $actualHash."
    }
    return $actualHash
}

function Get-ProfileComponents {
    param([string]$Field)
    $ids = @($ProfileDefinition.$Field)
    if ($ids.Count -eq 0) { throw "Generation profile $Profile has no $Field." }
    return @($ids | ForEach-Object { Get-ManifestComponent $_ })
}

function Get-ModelRuntimePath {
    param([object]$Component)
    switch ($Component.kind) {
        'generation_checkpoint' { return Join-Path (Join-Path $SharedRoot 'models\checkpoints') $Component.file_name }
        'generation_diffusion_model' { return Join-Path (Join-Path $ReviewedModelRoot 'diffusion_models') $Component.file_name }
        'generation_text_encoder' { return Join-Path (Join-Path $ReviewedModelRoot 'text_encoders') $Component.file_name }
        'generation_vae' { return Join-Path (Join-Path $ReviewedModelRoot 'vae') $Component.file_name }
        default { throw "Profile $Profile references unsupported model component kind $($Component.kind)." }
    }
}

function Get-WorkflowRuntimePath {
    param([object]$Component)
    $filePathProperty = $Component.PSObject.Properties['file_path']
    $runtimePathProperty = $Component.PSObject.Properties['runtime_path']
    $relativePath = if ($null -ne $filePathProperty) { $filePathProperty.Value } elseif ($null -ne $runtimePathProperty) { $runtimePathProperty.Value } else { $null }
    if ([string]::IsNullOrWhiteSpace($relativePath) -or -not $relativePath.StartsWith('workflows/')) {
        throw "Workflow component $($Component.id) has no reviewed runtime path."
    }
    return Join-Path $McpRoot $relativePath
}

function Install-ProfileWorkflows {
    Assert-GenerationManifest
    foreach ($component in @(Get-ProfileComponents 'workflow_components')) {
        if ($component.runtime_enabled -ne $true) {
            throw "Workflow component $($component.id) is not runtime-enabled."
        }
        $runtimePath = Get-WorkflowRuntimePath $component
        if ($component.distribution -eq 'project_source_tooling') {
            $sourcePath = Join-Path $RepoRoot $component.source_path
            Assert-FileHash $sourcePath $component.file_sha256 "Source workflow $($component.id)" | Out-Null
            if (Test-Path -LiteralPath $runtimePath -PathType Leaf) {
                Assert-FileHash $runtimePath $component.file_sha256 "Runtime workflow $($component.id)" | Out-Null
                continue
            }
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $runtimePath) | Out-Null
            Copy-Item -LiteralPath $sourcePath -Destination $runtimePath
        }
        Assert-FileHash $runtimePath $component.file_sha256 "Runtime workflow $($component.id)" | Out-Null
    }
}

function Assert-GenerationManifest {
    Assert-RequiredFile $GenerationCheckPath 'Generation-component compliance checker'
    & node $GenerationCheckPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Generation-component manifest or source workflow compliance failed.'
    }
}

function Get-GitHead {
    param([string]$Path, [string]$Label)
    $head = & git -C $Path rev-parse HEAD 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($head)) {
        throw "$Label is not a readable Git checkout: $Path"
    }
    return $head.Trim()
}

function Assert-ReviewedGitCheckout {
    param([string]$Path, [string]$Label, [object]$Component)
    $head = Get-GitHead $Path $Label
    if ($head -ne $Component.revision) {
        throw "$Label revision mismatch. Expected $($Component.revision), found $head. Review and update the generation-component manifest before continuing."
    }
    $checkoutStatus = @(& git -C $Path status --porcelain=v1 --untracked-files=normal)
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect tracked changes in $Label." }
    $trackedChanges = @($checkoutStatus | Where-Object { -not $_.StartsWith('?? ') })
    if ($trackedChanges.Count -gt 0) {
        throw "$Label has tracked local changes. Review or remove them before using the generation pipeline."
    }
    $untrackedPaths = @($checkoutStatus | Where-Object { $_.StartsWith('?? ') } |
        ForEach-Object { $_.Substring(3).Replace('\', '/') })
    $unexpectedUntracked = @($untrackedPaths | Where-Object { $_ -notin @($Component.allowed_untracked_paths) })
    if ($unexpectedUntracked.Count -gt 0) {
        throw "$Label has unexpected untracked paths: $($unexpectedUntracked -join ', '). Review or remove them before continuing."
    }
    $remote = (& git -C $Path remote get-url origin 2>$null).Trim().TrimEnd('/')
    if ($LASTEXITCODE -ne 0) { throw "$Label has no readable origin remote." }
    $expectedRemote = $Component.source_url.Trim().TrimEnd('/')
    if ($remote -ne $expectedRemote -and $remote -ne "$expectedRemote.git") {
        throw "$Label origin mismatch. Expected $expectedRemote, found $remote."
    }
}

function Assert-LocalComponents {
    param([bool]$HashModels)

    Assert-GenerationManifest
    Assert-RequiredDirectory $ComfyRepo 'ComfyUI checkout'
    Assert-RequiredFile $ComfyStarter 'ComfyUI loopback starter'
    Assert-RequiredFile $ComfyExtraModelPaths 'ComfyUI extra model paths config'
    Assert-RequiredFile $ComfyPython 'ComfyUI Python'
    Assert-RequiredFile $ComfyMain 'ComfyUI entry point'
    Assert-RequiredFile $DesktopSharedModelPaths 'Comfy Desktop shared model paths config'
    Assert-RequiredDirectory $McpRoot 'ComfyUI MCP bridge checkout'
    Assert-RequiredFile $McpPython 'ComfyUI MCP bridge Python'
    Assert-RequiredFile $McpServer 'ComfyUI MCP bridge server'
    Assert-RequiredFile $McpRequirementsLock 'ComfyUI MCP bridge requirements lock'
    Assert-RequiredFile $McpConfigPath 'ComfyUI MCP defaults'
    Assert-RequiredDirectory $ComfyInputRoot 'ComfyUI input directory'

    Assert-ReviewedGitCheckout $ComfyRepo 'ComfyUI' $ComfyComponent
    Assert-ReviewedGitCheckout $McpRoot 'ComfyUI MCP bridge' $McpComponent

    $launcherHash = (Get-FileHash -LiteralPath $ComfyStarter -Algorithm SHA256).Hash
    if ($launcherHash -ne $ComfyComponent.local_launcher_sha256) {
        throw "ComfyUI launcher hash mismatch. Expected $($ComfyComponent.local_launcher_sha256), found $launcherHash."
    }
    Assert-FileHash $ComfyExtraModelPaths $ComfyComponent.local_extra_model_paths_sha256 'ComfyUI extra model paths config' | Out-Null
    $requirementsHash = (Get-FileHash -LiteralPath $McpRequirementsLock -Algorithm SHA256).Hash
    if ($requirementsHash -ne $McpComponent.requirements_lock_sha256) {
        throw "MCP requirements lock hash mismatch. Expected $($McpComponent.requirements_lock_sha256), found $requirementsHash."
    }
    foreach ($workflow in @(Get-ProfileComponents 'workflow_components')) {
        if ($workflow.distribution -eq 'project_source_tooling') {
            Assert-FileHash (Join-Path $RepoRoot $workflow.source_path) $workflow.file_sha256 "Source workflow $($workflow.id)" | Out-Null
        }
        Assert-FileHash (Get-WorkflowRuntimePath $workflow) $workflow.file_sha256 "Runtime workflow $($workflow.id); run Prepare -Profile $Profile first" | Out-Null
    }

    $pythonVersion = (& $McpPython --version 2>&1).ToString().Trim() -replace '^Python\s+', ''
    if ($pythonVersion -ne $McpComponent.python_version) {
        throw "MCP bridge Python mismatch. Expected $($McpComponent.python_version), found $pythonVersion."
    }
    $expectedPackages = @(Get-Content -LiteralPath $McpRequirementsLock |
        Where-Object { $_ -and -not $_.StartsWith('#') } | Sort-Object)
    $installedPackages = @(& $McpPython -m pip freeze | Sort-Object)
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the MCP bridge Python environment.' }
    $packageDifference = @(Compare-Object $expectedPackages $installedPackages)
    if ($packageDifference.Count -gt 0) {
        throw "MCP bridge Python environment differs from $McpRequirementsLock. Recreate the external virtual environment from that lock before continuing."
    }
    & $McpPython -m pip check | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'MCP bridge Python environment has broken dependencies.' }

    foreach ($model in @(Get-ProfileComponents 'model_components')) {
        $modelPath = Get-ModelRuntimePath $model
        Assert-RequiredFile $modelPath "Profile model $($model.id)"
        $modelFile = Get-Item -LiteralPath $modelPath
        if ($modelFile.Length -ne [long]$model.file_size) {
            throw "Profile model $($model.id) size mismatch. Expected $($model.file_size), found $($modelFile.Length)."
        }
        if ($HashModels) {
            Assert-FileHash $modelPath $model.file_sha256 "Profile model $($model.id)" | Out-Null
        }
    }

    $configHash = (Get-FileHash -LiteralPath $McpConfigPath -Algorithm SHA256).Hash
    if ($configHash -ne $McpComponent.local_config_sha256) {
        throw "MCP local config hash mismatch. Expected $($McpComponent.local_config_sha256), found $configHash."
    }
    $config = Get-Content -LiteralPath $McpConfigPath -Raw | ConvertFrom-Json
    if ($config.defaults.image.model -ne $CheckpointComponent.file_name) {
        throw "MCP image default must name the reviewed checkpoint $($CheckpointComponent.file_name)."
    }
}

function Get-PortListeners {
    param([int]$Port)
    return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Get-LoopbackListeners {
    param([int]$Port)
    return @(Get-PortListeners $Port |
        Where-Object { $_.LocalAddress -in @('127.0.0.1', '::1') })
}

function Assert-LoopbackBinding {
    param([int]$Port, [string]$Label)
    $nonLoopback = @(Get-PortListeners $Port |
        Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') })
    if ($nonLoopback.Count -gt 0) {
        $addresses = ($nonLoopback | Select-Object -ExpandProperty LocalAddress -Unique) -join ', '
        throw "$Label port $Port is exposed beyond loopback ($addresses). Stop it before continuing."
    }
}

function Test-ComfyHealth {
    if (@(Get-LoopbackListeners 8188).Count -eq 0) { return $false }
    try {
        $response = Invoke-RestMethod -Uri 'http://127.0.0.1:8188/system_stats' -TimeoutSec 3
        return $null -ne $response.system
    } catch {
        return $false
    }
}

function Invoke-McpProbe {
    param([bool]$RequireProfileTools)
    $arguments = @(
        $SmokeHelper,
        '--endpoint', 'http://127.0.0.1:9000/mcp',
        '--probe',
        '--profile', $Profile,
        '--timeout', '30'
    )
    $requiredTools = if ($RequireProfileTools) { @($ProfileDefinition.required_mcp_tools) } else { @('list_workflows') }
    foreach ($tool in $requiredTools) { $arguments += @('--require-tool', $tool) }
    & $McpPython @arguments
    if ($LASTEXITCODE -ne 0) { throw 'ComfyUI MCP probe failed.' }
}

function Test-McpHealth {
    param([bool]$RequireProfileTools = $false)
    if (@(Get-LoopbackListeners 9000).Count -eq 0) { return $false }
    try {
        foreach ($listener in @(Get-LoopbackListeners 9000)) {
            if (-not (Test-ProcessAncestry ([int]$listener.OwningProcess) $McpRoot)) { return $false }
        }
        $null = Invoke-McpProbe $RequireProfileTools
        return $true
    } catch {
        return $false
    }
}

function Test-ComfyProfileLaunch {
    if (@(Get-LoopbackListeners 8188).Count -eq 0) { return $false }
    foreach ($listener in @(Get-LoopbackListeners 8188)) {
        if (-not (Test-ProcessAncestry ([int]$listener.OwningProcess) $ComfyMain)) { return $false }
    }
    if ($ProfileDefinition.comfy_launch_mode -eq 'pinned_launcher') { return $true }
    if ($ProfileDefinition.comfy_launch_mode -ne 'lowvram_no_preview') {
        throw "Unsupported Comfy launch mode $($ProfileDefinition.comfy_launch_mode)."
    }
    foreach ($listener in @(Get-LoopbackListeners 8188)) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$listener.OwningProcess)" -ErrorAction SilentlyContinue
        $commandLine = $process.CommandLine -as [string]
        if (-not $commandLine -or -not $commandLine.Contains('--lowvram') -or
            $commandLine -notmatch '--preview-method\s+none(?:\s|$)') {
            return $false
        }
    }
    return $true
}

function Quote-ProcessArgument {
    param([string]$Value)
    if ($Value.Contains('"')) { throw 'Reviewed process paths must not contain quote characters.' }
    return '"' + $Value + '"'
}

function Start-ComfyForProfile {
    $stdoutPath = Join-Path $StateRoot 'comfy.stdout.log'
    $stderrPath = Join-Path $StateRoot 'comfy.stderr.log'
    if ($ProfileDefinition.comfy_launch_mode -eq 'pinned_launcher') {
        return Start-Process -FilePath $ComfyStarter -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    }
    if ($ProfileDefinition.comfy_launch_mode -ne 'lowvram_no_preview') {
        throw "Unsupported Comfy launch mode $($ProfileDefinition.comfy_launch_mode)."
    }
    $arguments = @(
        '-s', (Quote-ProcessArgument $ComfyMain),
        '--listen', '127.0.0.1',
        '--port', '8188',
        '--enable-manager',
        '--extra-model-paths-config', (Quote-ProcessArgument $DesktopSharedModelPaths),
        '--input-directory', (Quote-ProcessArgument $ComfyInputRoot),
        '--output-directory', (Quote-ProcessArgument $ComfyOutputRoot),
        '--lowvram',
        '--preview-method', 'none'
    ) -join ' '
    return Start-Process -FilePath $ComfyPython -ArgumentList $arguments -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
}

function Wait-ForPortFree {
    param([int]$Port, [string]$Label)
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt 15) {
        if (@(Get-PortListeners $Port).Count -eq 0) { return }
        Start-Sleep -Milliseconds 250
    }
    throw "$Label port $Port did not close after the reviewed process stopped."
}

function Wait-ForHealth {
    param([scriptblock]$Probe, [string]$Label)
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        if (& $Probe) { return }
        Start-Sleep -Seconds 1
    }
    throw "$Label did not become ready within $TimeoutSeconds seconds."
}

function Get-CodexRegistration {
    if (-not (Test-Path -LiteralPath $CodexConfigPath -PathType Leaf)) { return $false }
    $configText = Get-Content -LiteralPath $CodexConfigPath -Raw
    return $configText.Contains('[mcp_servers.comfyui]') -and
        $configText.Contains('http://127.0.0.1:9000/mcp')
}

function Get-PipelineStatus {
    param([bool]$HashModels)
    Assert-LocalComponents $HashModels
    Assert-LoopbackBinding 8188 'ComfyUI'
    Assert-LoopbackBinding 9000 'MCP bridge'

    $comfyReady = Test-ComfyHealth
    $mcpReady = Test-McpHealth $false
    $profileToolsRegistered = if ($mcpReady) { Test-McpHealth $true } else { $false }
    $gpu = $null
    $runtimeVersion = $ComfyComponent.version
    if ($comfyReady) {
        $stats = Invoke-RestMethod -Uri 'http://127.0.0.1:8188/system_stats' -TimeoutSec 3
        $runtimeVersion = $stats.system.comfyui_version
        if ($runtimeVersion -ne $ComfyComponent.version) {
            throw "Running ComfyUI version mismatch. Expected $($ComfyComponent.version), found $runtimeVersion."
        }
        if ($stats.devices -and $stats.devices.Count -gt 0) { $gpu = $stats.devices[0].name }
    }

    $models = @(Get-ProfileComponents 'model_components' | ForEach-Object {
        [pscustomobject]@{
            id = $_.id
            file = $_.file_name
            path = Get-ModelRuntimePath $_
            sha256 = $_.file_sha256
            hash_verified = $HashModels
        }
    })
    $workflows = @(Get-ProfileComponents 'workflow_components' | ForEach-Object {
        [pscustomobject]@{
            id = $_.id
            runtime_path = Get-WorkflowRuntimePath $_
            input_mode = $_.input_mode
            sha256 = $_.file_sha256
        }
    })

    return [pscustomobject]@{
        action = 'Status'
        profile = $Profile
        profile_state = $ProfileDefinition.state
        comfyui = if ($comfyReady) { 'ready' } else { 'stopped' }
        comfyui_version = $runtimeVersion
        comfyui_revision = $ComfyComponent.revision
        gpu = $gpu
        comfy_launch_mode = $ProfileDefinition.comfy_launch_mode
        comfy_launch_ready = if ($comfyReady) { Test-ComfyProfileLaunch } else { $false }
        mcp_bridge = if ($mcpReady) { 'ready' } else { 'stopped' }
        mcp_revision = $McpComponent.revision
        endpoint = 'http://127.0.0.1:9000/mcp'
        codex_registered = Get-CodexRegistration
        required_mcp_tools = @($ProfileDefinition.required_mcp_tools)
        profile_tools_registered = $profileToolsRegistered
        models = $models
        workflows = $workflows
        staged_input_root = $StagedInputRoot
        output_root = $ComfyOutputRoot
        state_root = $StateRoot
    }
}

function Write-PipelineStatus {
    param([bool]$HashModels)
    $status = Get-PipelineStatus $HashModels
    if ($Json) { $status | ConvertTo-Json -Depth 4 -Compress }
    else { $status | Format-List }
}

function Start-Pipeline {
    Install-ProfileWorkflows
    Assert-LocalComponents $true
    Assert-LoopbackBinding 8188 'ComfyUI'
    Assert-LoopbackBinding 9000 'MCP bridge'
    New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

    $comfyRootProcessId = $null
    if (@(Get-LoopbackListeners 8188).Count -gt 0) {
        if (-not (Test-ComfyHealth)) {
            throw 'Port 8188 is occupied but does not answer as the reviewed ComfyUI service.'
        }
        if (-not (Test-ComfyProfileLaunch)) {
            Stop-ReviewedListener 8188 $ComfyMain 'ComfyUI'
            Wait-ForPortFree 8188 'ComfyUI'
        }
    }
    if (@(Get-LoopbackListeners 8188).Count -eq 0) {
        $process = Start-ComfyForProfile
        $comfyRootProcessId = $process.Id
        Wait-ForHealth { Test-ComfyHealth } 'ComfyUI'
        if (-not (Test-ComfyProfileLaunch)) { throw "ComfyUI did not start with the reviewed $Profile launch mode." }
    }

    $mcpRootProcessId = $null
    if (@(Get-LoopbackListeners 9000).Count -gt 0) {
        if (-not (Test-McpHealth $false)) {
            throw 'Port 9000 is occupied but does not answer as the reviewed ComfyUI MCP bridge.'
        }
        if (-not (Test-McpHealth $true)) {
            Stop-ReviewedListener 9000 $McpRoot 'MCP bridge'
            Wait-ForPortFree 9000 'MCP bridge'
        }
    }
    if (@(Get-LoopbackListeners 9000).Count -eq 0) {
        $process = Start-Process -FilePath $McpPython -ArgumentList 'server.py' -WorkingDirectory $McpRoot `
            -WindowStyle Hidden -RedirectStandardOutput (Join-Path $StateRoot 'mcp.stdout.log') `
            -RedirectStandardError (Join-Path $StateRoot 'mcp.stderr.log') -PassThru
        $mcpRootProcessId = $process.Id
        Wait-ForHealth { Test-McpHealth $true } 'ComfyUI MCP bridge profile registration'
    }

    $state = [ordered]@{
        started_at = (Get-Date).ToUniversalTime().ToString('o')
        profile = $Profile
        comfy_root_process_id = $comfyRootProcessId
        mcp_root_process_id = $mcpRootProcessId
        comfy_listener_process_ids = @((Get-LoopbackListeners 8188 | Select-Object -ExpandProperty OwningProcess -Unique))
        mcp_listener_process_ids = @((Get-LoopbackListeners 9000 | Select-Object -ExpandProperty OwningProcess -Unique))
        comfy_revision = $ComfyComponent.revision
        mcp_revision = $McpComponent.revision
        required_mcp_tools = @($ProfileDefinition.required_mcp_tools)
    }
    $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $StatePath -Encoding UTF8
    Write-PipelineStatus $true
}

function Test-ProcessAncestry {
    param([int]$ProcessId, [string]$ExpectedFragment)
    $currentId = $ProcessId
    for ($depth = 0; $depth -lt 6 -and $currentId -gt 0; $depth++) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $currentId" -ErrorAction SilentlyContinue
        if ($null -eq $process) { return $false }
        $commandLine = $process.CommandLine -as [string]
        if ($commandLine -and $commandLine.Contains($ExpectedFragment)) { return $true }
        $currentId = [int]$process.ParentProcessId
    }
    return $false
}

function Stop-ReviewedListener {
    param([int]$Port, [string]$ExpectedFragment, [string]$Label)
    $listeners = Get-PortListeners $Port
    foreach ($listener in $listeners) {
        $processId = [int]$listener.OwningProcess
        if (-not (Test-ProcessAncestry $processId $ExpectedFragment)) {
            throw "Refusing to stop $Label process $processId because its command ancestry does not contain the reviewed path $ExpectedFragment."
        }
        Stop-Process -Id $processId -Force
    }
}

function Stop-StateRootProcess {
    param([object]$ProcessId, [string]$ExpectedFragment)
    if ($null -eq $ProcessId) { return }
    $numericId = [int]$ProcessId
    if (-not (Get-Process -Id $numericId -ErrorAction SilentlyContinue)) { return }
    if (-not (Test-ProcessAncestry $numericId $ExpectedFragment)) {
        throw "Refusing to stop recorded process $numericId because it no longer matches the reviewed command path."
    }
    Stop-Process -Id $numericId -Force
}

function Stop-Pipeline {
    Stop-ReviewedListener 9000 $McpRoot 'MCP bridge'
    Stop-ReviewedListener 8188 (Join-Path $ComfyRepo 'main.py') 'ComfyUI'

    if (Test-Path -LiteralPath $StatePath -PathType Leaf) {
        $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
        Stop-StateRootProcess $state.mcp_root_process_id $McpRoot
        $stateProfileProperty = $state.PSObject.Properties['profile']
        $stateProfile = if ($null -ne $stateProfileProperty) { $stateProfileProperty.Value } else { 'sd15' }
        $comfyRootFragment = if ($stateProfile -eq 'flux2-klein') { $ComfyMain } else { $ComfyStarter }
        Stop-StateRootProcess $state.comfy_root_process_id $comfyRootFragment
        Remove-Item -LiteralPath $StatePath
    }
    Start-Sleep -Seconds 1
    Write-PipelineStatus $false
}

function Invoke-PipelineSmoke {
    Assert-LocalComponents $true
    Assert-LoopbackBinding 8188 'ComfyUI'
    Assert-LoopbackBinding 9000 'MCP bridge'
    if (-not (Test-ComfyHealth)) { throw 'ComfyUI is not ready. Run this script with -Action Start first.' }
    if (-not (Test-ComfyProfileLaunch)) { throw "ComfyUI is not running with the reviewed $Profile launch mode." }
    if (-not (Test-McpHealth $true)) { throw "The ComfyUI MCP bridge lacks the reviewed $Profile tool registration. Run Start -Profile $Profile first." }
    & $McpPython $SmokeHelper --endpoint 'http://127.0.0.1:9000/mcp' --profile $Profile --timeout 300
    if ($LASTEXITCODE -ne 0) { throw 'The bounded ComfyUI MCP smoke failed.' }
    Write-Output "Smoke output remains quarantined under: $ComfyOutputRoot"
}

function Prepare-ProfilePipeline {
    Install-ProfileWorkflows
    Assert-LocalComponents $true
    Write-PipelineStatus $true
}

function Stage-ProfileInput {
    if ([string]::IsNullOrWhiteSpace($InputImage)) {
        throw 'StageInput requires -InputImage with an explicit PNG, JPEG, or WebP path.'
    }

    Install-ProfileWorkflows
    Assert-LocalComponents $false
    Assert-RequiredFile $InputImage 'Conditioned input image'

    $sourcePath = (Resolve-Path -LiteralPath $InputImage).Path
    $sourceExtension = [IO.Path]::GetExtension($sourcePath).ToLowerInvariant()
    if ($sourceExtension -notin @('.png', '.jpg', '.jpeg', '.webp')) {
        throw 'Conditioned input must be a PNG, JPEG, or WebP file.'
    }

    $allowedSourceRoots = @(
        (Join-Path $RepoRoot 'docs\images'),
        (Join-Path $RepoRoot 'assets-quarantine'),
        (Join-Path $SharedRoot 'output')
    )
    $sourceAllowed = $false
    foreach ($allowedRoot in $allowedSourceRoots) {
        $normalizedRoot = [IO.Path]::GetFullPath($allowedRoot).TrimEnd(
            [IO.Path]::DirectorySeparatorChar,
            [IO.Path]::AltDirectorySeparatorChar
        ) + [IO.Path]::DirectorySeparatorChar
        if ($sourcePath.StartsWith($normalizedRoot, [StringComparison]::OrdinalIgnoreCase)) {
            $sourceAllowed = $true
            break
        }
    }
    if (-not $sourceAllowed) {
        throw 'Conditioned input must come from docs/images, assets-quarantine, or the external ComfyUI output directory.'
    }

    New-Item -ItemType Directory -Force -Path $StagedInputRoot | Out-Null
    $targetPath = Join-Path $StagedInputRoot $StagedName
    $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
    if (Test-Path -LiteralPath $targetPath -PathType Leaf) {
        $targetHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash
        if ($targetHash -ne $sourceHash) {
            throw "Staged input $StagedName already exists with different bytes. Choose a new -StagedName or review and remove the old external input."
        }
    } else {
        Copy-Item -LiteralPath $sourcePath -Destination $targetPath
        Assert-FileHash $targetPath $sourceHash 'Staged conditioned input' | Out-Null
    }

    $conditionedWorkflows = @(Get-ProfileComponents 'workflow_components' | Where-Object input_mode -eq 'image_to_image')
    if ($conditionedWorkflows.Count -ne 1) {
        throw "Profile $Profile must contain exactly one reviewed image-to-image workflow."
    }
    $conditionedWorkflow = $conditionedWorkflows[0]
    $result = [pscustomobject]@{
        action = 'StageInput'
        profile = $Profile
        source_path = $sourcePath
        source_sha256 = $sourceHash
        staged_path = $targetPath
        reference_image = "wormsport/$StagedName"
        workflow_id = [IO.Path]::GetFileNameWithoutExtension((Get-WorkflowRuntimePath $conditionedWorkflow))
    }
    if ($Json) { $result | ConvertTo-Json -Depth 3 -Compress }
    else { $result | Format-List }
}

switch ($Action) {
    'Start' { Start-Pipeline }
    'Status' { Write-PipelineStatus ([bool]$VerifyHashes) }
    'Stop' { Stop-Pipeline }
    'Smoke' { Invoke-PipelineSmoke }
    'Prepare' { Prepare-ProfilePipeline }
    'StageInput' { Stage-ProfileInput }
}
