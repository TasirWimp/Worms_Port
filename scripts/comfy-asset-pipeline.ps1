[CmdletBinding()]
param(
    [ValidateSet('Start', 'Status', 'Stop', 'Smoke', 'Prepare', 'StageInput')]
    [string]$Action = 'Status',
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

$ComfyRoot = Get-ConfiguredPath 'WORMS_COMFY_ROOT' 'E:\ComFy\TasirWimp'
$McpRoot = Get-ConfiguredPath 'WORMS_COMFY_MCP_ROOT' (Join-Path $HOME 'Desktop\Projects\comfyui-mcp-server')
$SharedRoot = Get-ConfiguredPath 'WORMS_COMFY_SHARED_ROOT' (Join-Path $env:LOCALAPPDATA 'Comfy-Desktop\ComfyUI-Shared')
$McpConfigPath = Get-ConfiguredPath 'WORMS_COMFY_MCP_CONFIG' (Join-Path $HOME '.config\comfy-mcp\config.json')
$CodexConfigPath = Get-ConfiguredPath 'WORMS_CODEX_CONFIG' (Join-Path $HOME '.codex\config.toml')
$StateRoot = Join-Path $env:LOCALAPPDATA 'Worms_Port\comfy-pipeline'
$StatePath = Join-Path $StateRoot 'state.json'
$ComfyRepo = Join-Path $ComfyRoot 'ComfyUI'
$ComfyStarter = Join-Path $ComfyRoot 'start-comfy-api.bat'
$McpPython = Join-Path $McpRoot '.venv\Scripts\python.exe'
$McpServer = Join-Path $McpRoot 'server.py'
$SmokeHelper = Join-Path $RepoRoot 'scripts\comfy-mcp-smoke.py'
$CheckpointComponent = $Manifest.components | Where-Object id -eq 'stable-diffusion-v1-5-archive-fp16'
$ComfyComponent = $Manifest.components | Where-Object id -eq 'comfyui'
$McpComponent = $Manifest.components | Where-Object id -eq 'comfyui-mcp-server'
$ImageWorkflowComponent = $Manifest.components | Where-Object id -eq 'comfyui-mcp-generate-image-workflow'
$ConditionedWorkflowComponent = $Manifest.components | Where-Object id -eq 'wormsport-generate-image-conditioned-workflow'
$McpRequirementsLock = Join-Path $RepoRoot $McpComponent.requirements_lock
$ImageWorkflowPath = Join-Path $McpRoot $ImageWorkflowComponent.file_path
$ConditionedWorkflowSource = Join-Path $RepoRoot $ConditionedWorkflowComponent.source_path
$ConditionedWorkflowPath = Join-Path $McpRoot $ConditionedWorkflowComponent.runtime_path
$CheckpointPath = Join-Path (Join-Path $SharedRoot 'models\checkpoints') $CheckpointComponent.file_name
$ComfyInputRoot = Join-Path $SharedRoot 'input'
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

function Install-ConditionedWorkflow {
    Assert-FileHash $ConditionedWorkflowSource $ConditionedWorkflowComponent.file_sha256 'Project image-conditioned workflow' | Out-Null

    if (Test-Path -LiteralPath $ConditionedWorkflowPath -PathType Leaf) {
        Assert-FileHash $ConditionedWorkflowPath $ConditionedWorkflowComponent.file_sha256 'Staged image-conditioned workflow' | Out-Null
        return
    }

    $runtimeDirectory = Split-Path -Parent $ConditionedWorkflowPath
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
    Copy-Item -LiteralPath $ConditionedWorkflowSource -Destination $ConditionedWorkflowPath
    Assert-FileHash $ConditionedWorkflowPath $ConditionedWorkflowComponent.file_sha256 'Staged image-conditioned workflow' | Out-Null
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
    param([bool]$HashCheckpoint)

    Assert-RequiredDirectory $ComfyRepo 'ComfyUI checkout'
    Assert-RequiredFile $ComfyStarter 'ComfyUI loopback starter'
    Assert-RequiredDirectory $McpRoot 'ComfyUI MCP bridge checkout'
    Assert-RequiredFile $McpPython 'ComfyUI MCP bridge Python'
    Assert-RequiredFile $McpServer 'ComfyUI MCP bridge server'
    Assert-RequiredFile $McpRequirementsLock 'ComfyUI MCP bridge requirements lock'
    Assert-RequiredFile $ImageWorkflowPath 'Reviewed image workflow'
    Assert-RequiredFile $ConditionedWorkflowSource 'Project image-conditioned workflow'
    Assert-RequiredFile $ConditionedWorkflowPath 'Staged image-conditioned workflow; run Prepare first'
    Assert-RequiredFile $McpConfigPath 'ComfyUI MCP defaults'
    Assert-RequiredFile $CheckpointPath 'Generation checkpoint'
    Assert-RequiredDirectory $ComfyInputRoot 'ComfyUI input directory'

    Assert-ReviewedGitCheckout $ComfyRepo 'ComfyUI' $ComfyComponent
    Assert-ReviewedGitCheckout $McpRoot 'ComfyUI MCP bridge' $McpComponent

    $launcherHash = (Get-FileHash -LiteralPath $ComfyStarter -Algorithm SHA256).Hash
    if ($launcherHash -ne $ComfyComponent.local_launcher_sha256) {
        throw "ComfyUI launcher hash mismatch. Expected $($ComfyComponent.local_launcher_sha256), found $launcherHash."
    }
    $requirementsHash = (Get-FileHash -LiteralPath $McpRequirementsLock -Algorithm SHA256).Hash
    if ($requirementsHash -ne $McpComponent.requirements_lock_sha256) {
        throw "MCP requirements lock hash mismatch. Expected $($McpComponent.requirements_lock_sha256), found $requirementsHash."
    }
    $workflowHash = (Get-FileHash -LiteralPath $ImageWorkflowPath -Algorithm SHA256).Hash
    if ($workflowHash -ne $ImageWorkflowComponent.file_sha256) {
        throw "Image workflow hash mismatch. Expected $($ImageWorkflowComponent.file_sha256), found $workflowHash. Review the exact workflow before continuing."
    }
    Assert-FileHash $ConditionedWorkflowSource $ConditionedWorkflowComponent.file_sha256 'Project image-conditioned workflow' | Out-Null
    Assert-FileHash $ConditionedWorkflowPath $ConditionedWorkflowComponent.file_sha256 'Staged image-conditioned workflow' | Out-Null

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

    $checkpoint = Get-Item -LiteralPath $CheckpointPath
    if ($checkpoint.Length -ne [long]$CheckpointComponent.file_size) {
        throw "Checkpoint size mismatch. Expected $($CheckpointComponent.file_size), found $($checkpoint.Length)."
    }
    if ($HashCheckpoint) {
        $hash = (Get-FileHash -LiteralPath $CheckpointPath -Algorithm SHA256).Hash
        if ($hash -ne $CheckpointComponent.file_sha256) {
            throw "Checkpoint hash mismatch. Expected $($CheckpointComponent.file_sha256), found $hash."
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
    & $McpPython $SmokeHelper --endpoint 'http://127.0.0.1:9000/mcp' --probe --timeout 30
    if ($LASTEXITCODE -ne 0) { throw 'ComfyUI MCP probe failed.' }
}

function Test-McpHealth {
    if (@(Get-LoopbackListeners 9000).Count -eq 0) { return $false }
    try {
        $null = Invoke-McpProbe
        return $true
    } catch {
        return $false
    }
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
    param([bool]$HashCheckpoint)
    Assert-LocalComponents $HashCheckpoint
    Assert-LoopbackBinding 8188 'ComfyUI'
    Assert-LoopbackBinding 9000 'MCP bridge'

    $comfyReady = Test-ComfyHealth
    $mcpReady = Test-McpHealth
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

    return [pscustomobject]@{
        action = 'Status'
        comfyui = if ($comfyReady) { 'ready' } else { 'stopped' }
        comfyui_version = $runtimeVersion
        comfyui_revision = $ComfyComponent.revision
        gpu = $gpu
        mcp_bridge = if ($mcpReady) { 'ready' } else { 'stopped' }
        mcp_revision = $McpComponent.revision
        endpoint = 'http://127.0.0.1:9000/mcp'
        codex_registered = Get-CodexRegistration
        checkpoint = $CheckpointComponent.file_name
        checkpoint_hash_verified = $HashCheckpoint
        image_workflow = $ImageWorkflowComponent.file_path
        image_workflow_sha256 = $ImageWorkflowComponent.file_sha256
        image_workflow_input_mode = $ImageWorkflowComponent.input_mode
        conditioned_workflow = $ConditionedWorkflowComponent.runtime_path
        conditioned_workflow_sha256 = $ConditionedWorkflowComponent.file_sha256
        conditioned_workflow_input_mode = $ConditionedWorkflowComponent.input_mode
        staged_input_root = $StagedInputRoot
        output_root = Join-Path $SharedRoot 'output'
        state_root = $StateRoot
    }
}

function Write-PipelineStatus {
    param([bool]$HashCheckpoint)
    $status = Get-PipelineStatus $HashCheckpoint
    if ($Json) { $status | ConvertTo-Json -Depth 4 -Compress }
    else { $status | Format-List }
}

function Start-Pipeline {
    Install-ConditionedWorkflow
    Assert-LocalComponents $true
    Assert-LoopbackBinding 8188 'ComfyUI'
    Assert-LoopbackBinding 9000 'MCP bridge'
    New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

    $comfyRootProcessId = $null
    if (@(Get-LoopbackListeners 8188).Count -gt 0) {
        if (-not (Test-ComfyHealth)) {
            throw 'Port 8188 is occupied but does not answer as the reviewed ComfyUI service.'
        }
    } else {
        $process = Start-Process -FilePath $ComfyStarter -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $StateRoot 'comfy.stdout.log') `
            -RedirectStandardError (Join-Path $StateRoot 'comfy.stderr.log') -PassThru
        $comfyRootProcessId = $process.Id
        Wait-ForHealth { Test-ComfyHealth } 'ComfyUI'
    }

    $mcpRootProcessId = $null
    if (@(Get-LoopbackListeners 9000).Count -gt 0) {
        if (-not (Test-McpHealth)) {
            throw 'Port 9000 is occupied but does not answer as the reviewed ComfyUI MCP bridge.'
        }
    } else {
        $process = Start-Process -FilePath $McpPython -ArgumentList 'server.py' -WorkingDirectory $McpRoot `
            -WindowStyle Hidden -RedirectStandardOutput (Join-Path $StateRoot 'mcp.stdout.log') `
            -RedirectStandardError (Join-Path $StateRoot 'mcp.stderr.log') -PassThru
        $mcpRootProcessId = $process.Id
        Wait-ForHealth { Test-McpHealth } 'ComfyUI MCP bridge'
    }

    $state = [ordered]@{
        started_at = (Get-Date).ToUniversalTime().ToString('o')
        comfy_root_process_id = $comfyRootProcessId
        mcp_root_process_id = $mcpRootProcessId
        comfy_listener_process_ids = @((Get-LoopbackListeners 8188 | Select-Object -ExpandProperty OwningProcess -Unique))
        mcp_listener_process_ids = @((Get-LoopbackListeners 9000 | Select-Object -ExpandProperty OwningProcess -Unique))
        comfy_revision = $ComfyComponent.revision
        mcp_revision = $McpComponent.revision
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
        Stop-StateRootProcess $state.comfy_root_process_id $ComfyStarter
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
    if (-not (Test-McpHealth)) { throw 'The ComfyUI MCP bridge is not ready. Run this script with -Action Start first.' }
    & $McpPython $SmokeHelper --endpoint 'http://127.0.0.1:9000/mcp' --timeout 300
    if ($LASTEXITCODE -ne 0) { throw 'The bounded ComfyUI MCP smoke failed.' }
    Write-Output "Smoke output remains quarantined under: $(Join-Path $SharedRoot 'output')"
}

function Prepare-ConditionedPipeline {
    Install-ConditionedWorkflow
    Assert-LocalComponents $true
    Write-PipelineStatus $true
}

function Stage-ConditionedInput {
    if ([string]::IsNullOrWhiteSpace($InputImage)) {
        throw 'StageInput requires -InputImage with an explicit PNG, JPEG, or WebP path.'
    }

    Install-ConditionedWorkflow
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

    $result = [pscustomobject]@{
        action = 'StageInput'
        source_path = $sourcePath
        source_sha256 = $sourceHash
        staged_path = $targetPath
        reference_image = "wormsport/$StagedName"
        workflow_id = [IO.Path]::GetFileNameWithoutExtension($ConditionedWorkflowComponent.runtime_path)
    }
    if ($Json) { $result | ConvertTo-Json -Depth 3 -Compress }
    else { $result | Format-List }
}

switch ($Action) {
    'Start' { Start-Pipeline }
    'Status' { Write-PipelineStatus ([bool]$VerifyHashes) }
    'Stop' { Stop-Pipeline }
    'Smoke' { Invoke-PipelineSmoke }
    'Prepare' { Prepare-ConditionedPipeline }
    'StageInput' { Stage-ConditionedInput }
}
