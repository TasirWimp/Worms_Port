const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'legal', 'generation-component-manifest.json');
const requiredIds = new Set([
  'comfyui',
  'comfyui-mcp-server',
  'stable-diffusion-v1-5-archive-fp16',
  'flux2-klein-4b-distilled-fp8',
  'flux2-klein-qwen3-4b-text-encoder',
  'flux2-vae',
  'wormsport-flux2-klein-text-to-image-workflow',
  'wormsport-flux2-klein-reference-edit-workflow',
  'wormsport-flux2-klein-protected-edit-workflow',
  'comfyui-mcp-generate-image-workflow',
  'wormsport-generate-image-conditioned-workflow'
]);
const allowedKinds = new Set([
  'external_generation_tool',
  'external_generation_bridge',
  'generation_checkpoint',
  'generation_diffusion_model',
  'generation_text_encoder',
  'generation_vae',
  'generation_lora',
  'generation_embedding',
  'generation_controlnet',
  'generation_upscaler',
  'generation_custom_node',
  'generation_workflow'
]);
const modelFileKinds = new Set([
  'generation_checkpoint',
  'generation_diffusion_model',
  'generation_text_encoder',
  'generation_vae'
]);
const reviewedModelContracts = new Map([
  ['stable-diffusion-v1-5-archive-fp16', {
    kind: 'generation_checkpoint',
    fileName: 'v1-5-pruned-emaonly-fp16.safetensors',
    fileSize: 2132696762,
    fileSha256: 'E9476A13728CD75D8279F6EC8BAD753A66A1957CA375A1464DC63B37DB6E3916',
    license: 'CreativeML-OpenRAIL-M'
  }],
  ['flux2-klein-4b-distilled-fp8', {
    kind: 'generation_diffusion_model',
    fileName: 'flux-2-klein-4b-fp8.safetensors',
    fileSize: 4070624520,
    fileSha256: '97ED34FE0567E436200F2FAEE3939B88F2B5D99F8AF2A4DC16532C4245C0CCB6',
    license: 'Apache-2.0',
    sourceRelation: 'canonical'
  }],
  ['flux2-klein-qwen3-4b-text-encoder', {
    kind: 'generation_text_encoder',
    fileName: 'qwen_3_4b_bfl_apache.safetensors',
    fileSize: 8044982048,
    fileSha256: 'AD65083F0B6561CC84B9B6A42FF397EE749171E367C28D800C4A6FD612ABC169',
    license: 'Apache-2.0',
    sourceRelation: 'deterministic_repackage'
  }],
  ['flux2-vae', {
    kind: 'generation_vae',
    fileName: 'flux2-vae.safetensors',
    fileSize: 336213556,
    fileSha256: 'D64F3A68E1CC4F9F4E29B6E0DA38A0204FE9A49F2D4053F0EC1FA1CA02F9C4B5',
    license: 'Apache-2.0',
    sourceRelation: 'canonical'
  }]
]);
const reviewedConditioningInputContracts = new Map([
  ['knotkin-wizard-structure-guide-v1', {
    kind: 'project_owned_structure_reference',
    sourcePath: 'docs/images/art-direction/knotkin-wizard-structure-guide.png',
    generatorPath: 'scripts/generate-wizard-structure-guide.js',
    width: 1024,
    height: 1024,
    fileSize: 15044,
    fileSha256: '5A8F1C1D0942755F113327467462D47812A22A64BAF3DF2C5CD2E0F491FA9AA1',
    generatorSha256: '695B499E67794692BFEB248C22CA24C24C2D0091107B4EAAE247D29830FCAF63'
  }],
  ['knotkin-wizard-cowl-edit-mask-v1', {
    kind: 'project_owned_edit_mask',
    sourcePath: 'docs/images/art-direction/knotkin-wizard-cowl-edit-mask.png',
    generatorPath: 'scripts/generate-wizard-cowl-edit-mask.js',
    width: 1024,
    height: 1024,
    fileSize: 11323,
    fileSha256: '2B6C5F51A6EA411BB8B9C40AF861A339622316CB1D9710719F7F0CDEC327425B',
    generatorSha256: '8DFD6623479D61603C046550F9184F13ADAE0C4FA3E40E9C49F2017E6F8634A1'
  }],
  ['knotkin-wizard-hood-structure-guide-v1', {
    kind: 'project_owned_structure_reference',
    sourcePath: 'docs/images/art-direction/knotkin-wizard-hood-structure-guide.png',
    generatorPath: 'scripts/generate-wizard-hood-structure-controls.js',
    width: 1024,
    height: 1024,
    fileSize: 25382,
    fileSha256: '08CB26CE3FAC6605859F9C9B51331351F28F40A005F6A101B2E575D8A56C6AB8',
    generatorSha256: '3B009E6F4A5908D4BAFA63426E7538F9B59DD2A4A286246FFC2604DCD7D0FB69'
  }],
  ['knotkin-wizard-hood-edit-mask-v1', {
    kind: 'project_owned_edit_mask',
    sourcePath: 'docs/images/art-direction/knotkin-wizard-hood-edit-mask.png',
    generatorPath: 'scripts/generate-wizard-hood-structure-controls.js',
    width: 1024,
    height: 1024,
    fileSize: 12461,
    fileSha256: 'AC9F8F101094C5C15361FD24827C4F24B7C52ACBC652000748B209CB5483F56B',
    generatorSha256: '3B009E6F4A5908D4BAFA63426E7538F9B59DD2A4A286246FFC2604DCD7D0FB69'
  }]
]);
const reviewedFluxWorkflowContracts = new Map([
  ['wormsport-flux2-klein-text-to-image-workflow', {
    sourcePath: 'scripts/comfy-workflows/generate_flux2_klein_text.json',
    runtimePath: 'workflows/generate_flux2_klein_text.json',
    inputMode: 'text_to_image',
    sourceTemplateUrl: 'https://github.com/Comfy-Org/workflow_templates/blob/cebdebc9fc2febcb97a5db0dd291f59f5300b176/templates/image_flux2_klein_text_to_image.json',
    sourceTemplateRevision: 'cebdebc9fc2febcb97a5db0dd291f59f5300b176',
    nodeClasses: [
      'CFGGuider',
      'CLIPLoader',
      'CLIPTextEncode',
      'ConditioningZeroOut',
      'EmptyFlux2LatentImage',
      'Flux2Scheduler',
      'KSamplerSelect',
      'RandomNoise',
      'SamplerCustomAdvanced',
      'SaveImage',
      'UNETLoader',
      'VAEDecode',
      'VAELoader'
    ],
    placeholders: ['PARAM_INT_SEED', 'PARAM_PROMPT'],
    runtimeEnabled: true
  }],
  ['wormsport-flux2-klein-reference-edit-workflow', {
    sourcePath: 'scripts/comfy-workflows/generate_flux2_klein_reference_edit.json',
    runtimePath: 'workflows/generate_flux2_klein_reference_edit.json',
    inputMode: 'image_to_image',
    sourceTemplateUrl: 'https://github.com/Comfy-Org/workflow_templates/blob/cebdebc9fc2febcb97a5db0dd291f59f5300b176/templates/image_flux2_klein_image_edit_4b_distilled.json',
    sourceTemplateRevision: 'cebdebc9fc2febcb97a5db0dd291f59f5300b176',
    nodeClasses: [
      'CFGGuider',
      'CLIPLoader',
      'CLIPTextEncode',
      'ConditioningZeroOut',
      'EmptyFlux2LatentImage',
      'Flux2Scheduler',
      'GetImageSize',
      'ImageScaleToTotalPixels',
      'KSamplerSelect',
      'LoadImage',
      'RandomNoise',
      'ReferenceLatent',
      'ReferenceLatent',
      'SamplerCustomAdvanced',
      'SaveImage',
      'UNETLoader',
      'VAEDecode',
      'VAEEncode',
      'VAELoader'
    ],
    placeholders: ['PARAM_INT_SEED', 'PARAM_PROMPT', 'PARAM_STR_REFERENCE_IMAGE'],
    runtimeEnabled: true
  }],
  ['wormsport-flux2-klein-protected-edit-workflow', {
    sourcePath: 'scripts/comfy-workflows/generate_flux2_klein_protected_edit.json',
    runtimePath: 'workflows/generate_flux2_klein_protected_edit.json',
    inputMode: 'masked_image_to_image',
    sourceTemplateUrl: 'https://github.com/Comfy-Org/workflow_templates/blob/cebdebc9fc2febcb97a5db0dd291f59f5300b176/templates/image_flux2_klein_image_edit_4b_distilled.json',
    sourceTemplateRevision: 'cebdebc9fc2febcb97a5db0dd291f59f5300b176',
    nodeClasses: [
      'CFGGuider',
      'CLIPLoader',
      'CLIPTextEncode',
      'ConditioningZeroOut',
      'Flux2Scheduler',
      'GetImageSize',
      'ImageCompositeMasked',
      'ImageScale',
      'ImageScaleToTotalPixels',
      'ImageToMask',
      'KSamplerSelect',
      'LoadImage',
      'LoadImage',
      'RandomNoise',
      'ReferenceLatent',
      'ReferenceLatent',
      'SamplerCustomAdvanced',
      'SaveImage',
      'SetLatentNoiseMask',
      'UNETLoader',
      'VAEDecode',
      'VAEEncode',
      'VAELoader'
    ],
    placeholders: [
      'PARAM_INT_SEED',
      'PARAM_PROMPT',
      'PARAM_STR_MASK_IMAGE',
      'PARAM_STR_REFERENCE_IMAGE'
    ],
    runtimeEnabled: true
  }]
]);
const reviewedFluxModelComponents = [
  'flux2-klein-4b-distilled-fp8',
  'flux2-klein-qwen3-4b-text-encoder',
  'flux2-vae'
];
const reviewedProfileContracts = new Map([
  ['sd15', {
    state: 'approved_quarantined_generation',
    modelComponents: ['stable-diffusion-v1-5-archive-fp16'],
    workflowComponents: [
      'comfyui-mcp-generate-image-workflow',
      'wormsport-generate-image-conditioned-workflow'
    ],
    requiredMcpTools: ['generate_image', 'generate_image_conditioned'],
    comfyLaunchMode: 'pinned_launcher',
    requiredComfyArguments: [],
    smokeTool: 'generate_image'
  }],
  ['flux2-klein', {
    state: 'wizard_threadball_cloud_terrain_top_terrain_interior_manual_masters_approved',
    modelComponents: reviewedFluxModelComponents,
    workflowComponents: [
      'wormsport-flux2-klein-text-to-image-workflow',
      'wormsport-flux2-klein-reference-edit-workflow',
      'wormsport-flux2-klein-protected-edit-workflow'
    ],
    requiredMcpTools: [
      'generate_flux2_klein_text',
      'generate_flux2_klein_reference_edit',
      'generate_flux2_klein_protected_edit'
    ],
    comfyLaunchMode: 'lowvram_no_preview',
    requiredComfyArguments: ['--lowvram', '--preview-method none'],
    smokeTool: 'generate_flux2_klein_text',
    latestReview: {
      decision: 'source_master_approved',
      generation_work_package: 'WP-015B2G',
      normalization_work_package: 'WP-015B2H',
      seed: 15027002,
      external_source_sha256: '40F9E81254A0792B967889808BD8BD8DE33DBDE5EAB7C4CBB1B336DD02BC54A5',
      normalization_config_path: 'scripts/asset-normalization/wp-015b2h-wizard-v1.json',
      normalized_master_sha256: '7AF4864E00C7206A05684312916092C6881127F921FA7CEA01524899093318A9',
      normalization_config_sha256: '2AAEF899BD9FDBE202D5D9A293F1DC971ED62AAC32ED95095AF662FE6567D644',
      normalizer_path: 'scripts/normalize-character-master.js',
      normalizer_sha256: 'B4AEF73CC30133F622C131A8E8D0322DECF953F933FEFC4EE83940FB328CDD82',
      normalized_master_path: 'assets/masters/characters/knotkin/wizard/knotkin-wizard-source-master-v1.png',
      runtime_path_assigned: false,
      further_generation_authorized: false
    },
    authorizedRequest: {
      decision: 'one_text_request_approved',
      work_package: 'WP-015B3A',
      purpose: 'worldweave-threadball-replacement',
      tool: 'generate_flux2_klein_text',
      workflow_sha256: '626568CEAA47627F7D421D3BD1B0AA151E1643DBA8FBD631F5EB437666649E28',
      seed: 15035001,
      prompt: 'One isolated mobile-game spell projectile centered on a plain white background: a compact spherical knot of tightly tensioned sky-blue chenille world-thread, layered strands pulled inward around a bright warm-gold NIM Thread core visible through several narrow openings. It hovers alone with contained magical pressure, tactile crochet fibers, a clean balanced silhouette, soft studio light, and generous padding. No character, hand, room, floor, shadow, loose trailing strands, sparks, rune, text, logo, fuse, flame, orbit, cage, or second object.',
      width: 1024,
      height: 1024,
      batch_size: 1,
      steps: 4,
      cfg: 1,
      sampler: 'euler',
      reference_input: 'none',
      max_requests: 1,
      status: 'consumed_source_master_approved',
      requests_consumed: 1,
      prompt_id: 'af2f84ad-deca-4a6d-bd83-b0b88e87c696',
      runtime_seconds: 272.426,
      external_output_path: 'C:\\Users\\jensb\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\output\\WormsPortFlux2KleinText_00006_.png',
      external_output_sha256: '1F41AF26B9F15419BFB5A59E2485B70EC706AB505672EC57AC8C9295B43F56EC',
      external_output_bytes: 787706,
      external_output_pixel_format: 'RGB24',
      further_requests_authorized: false,
      paused_candidate_sha256: '2BAE664F7E5A862BCB53B55A68071580485CE040A89650C68EC6FA398F4089EB',
      concept_reference_sha256: 'BD87405A8E29E4FCEEC87F4E4BC22256CEF215F2789DFDB1DD4BDD6A31DA6699',
      concept_reference_role: 'external_comparison_only'
    },
    threadballReview: {
      decision: 'source_master_approved',
      generation_work_package: 'WP-015B3A',
      normalization_work_package: 'WP-015B3A',
      seed: 15035001,
      external_source_sha256: '1F41AF26B9F15419BFB5A59E2485B70EC706AB505672EC57AC8C9295B43F56EC',
      normalization_config_path: 'scripts/asset-normalization/wp-015b3a-threadball-v1.json',
      normalization_config_sha256: 'CF8C6301E9A41DBAB2A16B127F4DF553F719474644761EBE865EDF3A0452635B',
      normalizer_path: 'scripts/normalize-relic-master.js',
      normalizer_sha256: 'F44A5B86B146EC678E3C594E9C9FD78CADD592F8AF5069BE8A9E4A7944D65B8B',
      normalized_master_path: 'assets/masters/relics/threadball/relic-threadball-source-master-v1.png',
      normalized_master_sha256: '608F490CEE2A7FA79F0EA47BF7B15A8E49685B7B1E65E5AE38E15A34B4CD9B6F',
      projectile_origin: [128, 128],
      runtime_path_assigned: false,
      further_generation_authorized: false
    },
    cloudAuthorizedRequest: {
      decision: 'one_text_request_approved',
      work_package: 'WP-015B3A',
      purpose: 'patch-01-cotton-cloud-source',
      tool: 'generate_flux2_klein_text',
      workflow_sha256: '626568CEAA47627F7D421D3BD1B0AA151E1643DBA8FBD631F5EB437666649E28',
      seed: 15035002,
      prompt: 'One isolated low horizontal cotton cloud layer for a mobile-game sky, centered on a plain white background: three overlapping soft off-white crochet pompoms form one connected calm cloud with a wide rounded silhouette, subtle visible fibers, even soft studio light, and generous padding. No separate cloud, scenery, horizon, ground, shadow, character, text, logo, icon, frame, weather, stars, rainbow, sun, moon, or dramatic lighting.',
      width: 1024,
      height: 1024,
      batch_size: 1,
      steps: 4,
      cfg: 1,
      sampler: 'euler',
      reference_input: 'none',
      max_requests: 1,
      status: 'consumed_source_master_approved',
      requests_consumed: 1,
      prompt_id: '0936905b-fb40-47e9-a621-8106e4382a93',
      runtime_seconds: 255.665,
      external_output_path: 'C:\\Users\\jensb\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\output\\WormsPortFlux2KleinText_00007_.png',
      external_output_sha256: 'EA972B0B884AE5D144C74AE01E490E9C8961A42619172060C11F53925D48FFE7',
      external_output_bytes: 688501,
      external_output_pixel_format: 'RGB24',
      further_requests_authorized: false
    },
    cloudReview: {
      decision: 'source_master_approved',
      generation_work_package: 'WP-015B3A',
      normalization_work_package: 'WP-015B3A',
      seed: 15035002,
      external_source_sha256: 'EA972B0B884AE5D144C74AE01E490E9C8961A42619172060C11F53925D48FFE7',
      normalization_config_path: 'scripts/asset-normalization/wp-015b3a-patch-cloud-v1.json',
      normalization_config_sha256: 'A13DB44E682870B262C6D2660790A63A5876F3131504DCA4F7E57C09309FAE78',
      normalizer_path: 'scripts/normalize-cloud-master.js',
      normalizer_sha256: '185E37D22822FEEB6FBA8049D77E18163758EFEF37CBDE28E13D82F9912B0492',
      normalized_master_path: 'assets/masters/environment/patch-01/clouds/patch-01-cloud-source-master-v1.png',
      normalized_master_sha256: '7F327B515FBF89F7DD275C4385FA194AE3F95E677C60BE10126CA68D9024B23C',
      placement_anchor: [256, 256],
      runtime_path_assigned: false,
      further_generation_authorized: false
    },
    terrainTopAuthorizedRequest: {
      decision: 'one_text_request_approved',
      work_package: 'WP-015B3A',
      purpose: 'patch-01-terrain-top-source',
      tool: 'generate_flux2_klein_text',
      workflow_sha256: '626568CEAA47627F7D421D3BD1B0AA151E1643DBA8FBD631F5EB437666649E28',
      seed: 15035003,
      prompt: 'One flat orthographic textile material study centered on a plain white background: an uninterrupted straight horizontal boundary reaches from left edge to right edge, with a shallow upper strip of tufted light-olive yarn grass above broader warm-brown felt earth, joined by one restrained line of small gold blanket stitches. Tactile fibers, calm even light, and consistent scale. No hill, perspective, object, scenery, border, text, logo, shadow, or central motif.',
      width: 1024,
      height: 1024,
      batch_size: 1,
      steps: 4,
      cfg: 1,
      sampler: 'euler',
      reference_input: 'none',
      max_requests: 1,
      status: 'consumed_source_master_approved',
      requests_consumed: 1,
      prompt_id: 'd2ca47de-5cfb-4830-bb2e-243edad798eb',
      runtime_seconds: 260.706,
      external_output_path: 'C:\\Users\\jensb\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\output\\WormsPortFlux2KleinText_00008_.png',
      external_output_sha256: 'BE5EB2E77062C9A86327ECC1EB7704C33F8511291709AE18A52D1AF51BE42B22',
      external_output_bytes: 774627,
      external_output_pixel_format: 'RGB24',
      further_requests_authorized: false
    },
    terrainTopReview: {
      decision: 'source_master_approved',
      generation_work_package: 'WP-015B3A',
      normalization_work_package: 'WP-015B3A',
      seed: 15035003,
      external_source_sha256: 'BE5EB2E77062C9A86327ECC1EB7704C33F8511291709AE18A52D1AF51BE42B22',
      normalization_config_path: 'scripts/asset-normalization/wp-015b3a-patch-terrain-top-v1.json',
      normalization_config_sha256: '4BA76F6477FF10F332B632C832EE314AB73FF624E9DBE3F05AE9B4673BF3FFC8',
      normalizer_path: 'scripts/normalize-terrain-top-master.js',
      normalizer_sha256: 'F5668C102F21E2098BA7246866A2BE1FB59CCA91988BDCF2BCEA5CF65AA4FC6F',
      normalized_master_path: 'assets/masters/environment/patch-01/terrain/patch-01-terrain-top-source-master-v1.png',
      normalized_master_sha256: '41511E63D0DBF602FCA854EB983DB9B754631587F6E5234CBB9DAF9113E77897',
      source_crop: [0, 392, 1024, 256],
      master_canvas: [256, 64],
      repeat_edge_maximum_difference: 0,
      runtime_path_assigned: false,
      further_generation_authorized: false
    },
    terrainInteriorAuthorizedRequest: {
      decision: 'one_text_request_approved',
      work_package: 'WP-015B3A',
      purpose: 'patch-01-terrain-interior-source',
      tool: 'generate_flux2_klein_text',
      workflow_sha256: '626568CEAA47627F7D421D3BD1B0AA151E1643DBA8FBD631F5EB437666649E28',
      seed: 15035004,
      prompt: 'One flat orthographic square textile material study filling the canvas: evenly distributed warm-brown felt and dense short crochet fibers with sparse tiny gold stitches, quiet tactile depth, consistent scale, and even soft light. No central motif, directional pattern, border, seam, horizon, grass, stone, object, character, text, logo, shadow, vignette, or scenery.',
      width: 1024,
      height: 1024,
      batch_size: 1,
      steps: 4,
      cfg: 1,
      sampler: 'euler',
      reference_input: 'none',
      max_requests: 1,
      status: 'consumed_rejected_contract_violation',
      requests_consumed: 1,
      prompt_id: 'db813267-25e6-4bef-ba14-ea8b41d491c6',
      runtime_seconds: 255.203,
      external_output_path: 'C:\\Users\\jensb\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\output\\WormsPortFlux2KleinText_00009_.png',
      external_output_sha256: '98091C738D0E226FCAFA60EFA00BB4F63A503723CC310726E7787FEC702250F9',
      external_output_bytes: 2440150,
      external_output_pixel_format: 'RGB24',
      further_requests_authorized: false
    },
    terrainInteriorManualRepairReview: {
      decision: 'source_master_approved_owner_manual_repair',
      recovery_work_package: 'WP-015B3C',
      rejected_external_source_sha256: '98091C738D0E226FCAFA60EFA00BB4F63A503723CC310726E7787FEC702250F9',
      editable_source_sha256: '2E94BBE46A3E901BB8EB14B21F413E8ACCB850D3443FFD72308D63B09DCDBC7B',
      editable_source_bytes: 6331391,
      flattened_export_sha256: '6419C1E81F13FF75650A13F1FE6654711A7334C9A24EC48F86C4356533CF8095',
      flattened_export_bytes: 2731505,
      export_tool: 'GIMP 3.2.4 non-interactive flattened PNG export',
      normalization_config_path: 'scripts/asset-normalization/wp-015b3c-patch-terrain-interior-manual-v1.json',
      normalization_config_sha256: '73118EE47A92EEA00DD78D11508F4031EA532B8DB798030B56E48A19C951C71D',
      normalizer_path: 'scripts/normalize-terrain-interior-master.js',
      normalizer_sha256: '0DBA3767ECDF3B92A1C26653F899950FD1E8998E035BE7FB22B3EFFA2D4ED0CA',
      normalized_master_path: 'assets/masters/environment/patch-01/terrain/patch-01-terrain-interior-source-master-v1.png',
      normalized_master_sha256: 'D50C2C60A9941DEF0CD9E1C3C98A205A329CCFEC8766F3B1B70456728E2E40E9',
      master_canvas: [256, 256],
      horizontal_repeat_edge_maximum_difference: 0,
      vertical_repeat_edge_maximum_difference: 0,
      runtime_path_assigned: false,
      further_generation_authorized: false
    },
    requiredNoteFragments: [
      'WP-015B2D',
      'DEF9265DAA4C6F2799D16870205E2015291E3E4AAE0F61802349C9FD8D56AD00',
      '15026004',
      '0.880098',
      'project owner',
      'AD4D4F96AD7D7C024A1A903A440DD4FE6D9E31353ACB7E436BF7DFC787321DAA',
      '2B6C5F51A6EA411BB8B9C40AF861A339622316CB1D9710719F7F0CDEC327425B',
      '15026005',
      'exactly one',
      '1275B2BD8021EAA5C51AA0606A6CC20BA21B15ED6CEBC4A7C1FC76308BA9D2E0',
      'd023da3f-77cf-4f05-ae7b-62ce66f1f176',
      '907427',
      '0.840783',
      'No retry',
      'WP-015B2F',
      '08CB26CE3FAC6605859F9C9B51331351F28F40A005F6A101B2E575D8A56C6AB8',
      'AC9F8F101094C5C15361FD24827C4F24B7C52ACBC652000748B209CB5483F56B',
      'A048CA16B249298BBECFAD2F57552B04958E26F766D01F6577D1C6A011A0231C',
      'approved',
      '15026006',
      'wormsport/wizard-hood-scaffold-v1.png',
      'wormsport/wizard-hood-edit-mask-v1.png',
      'Exactly one',
      '1f5fc569-5250-4799-a236-0bb22ba629c8',
      '355.120',
      'BE162B61FF38BE0EE2EA58716BDBAF5D2B38F0D8E6608953D2ECA41EFE7AD608',
      '844934',
      '0.796676',
      'seams',
      'No retry',
      'WP-015B3A',
      '15035001',
      '626568CEAA47627F7D421D3BD1B0AA151E1643DBA8FBD631F5EB437666649E28',
      'BD87405A8E29E4FCEEC87F4E4BC22256CEF215F2789DFDB1DD4BDD6A31DA6699',
      'af2f84ad-deca-4a6d-bd83-b0b88e87c696',
      '272.426',
      '1F41AF26B9F15419BFB5A59E2485B70EC706AB505672EC57AC8C9295B43F56EC',
      'CF8C6301E9A41DBAB2A16B127F4DF553F719474644761EBE865EDF3A0452635B',
      'F44A5B86B146EC678E3C594E9C9FD78CADD592F8AF5069BE8A9E4A7944D65B8B',
      '608F490CEE2A7FA79F0EA47BF7B15A8E49685B7B1E65E5AE38E15A34B4CD9B6F',
      '15035002',
      '0936905b-fb40-47e9-a621-8106e4382a93',
      '255.665',
      'EA972B0B884AE5D144C74AE01E490E9C8961A42619172060C11F53925D48FFE7',
      'A13DB44E682870B262C6D2660790A63A5876F3131504DCA4F7E57C09309FAE78',
      '185E37D22822FEEB6FBA8049D77E18163758EFEF37CBDE28E13D82F9912B0492',
      '7F327B515FBF89F7DD275C4385FA194AE3F95E677C60BE10126CA68D9024B23C',
      '15035003',
      'd2ca47de-5cfb-4830-bb2e-243edad798eb',
      'BE5EB2E77062C9A86327ECC1EB7704C33F8511291709AE18A52D1AF51BE42B22',
      '4BA76F6477FF10F332B632C832EE314AB73FF624E9DBE3F05AE9B4673BF3FFC8',
      'F5668C102F21E2098BA7246866A2BE1FB59CCA91988BDCF2BCEA5CF65AA4FC6F',
      '41511E63D0DBF602FCA854EB983DB9B754631587F6E5234CBB9DAF9113E77897',
      'three-copy repeat proof has exact seam difference zero',
      '98091C738D0E226FCAFA60EFA00BB4F63A503723CC310726E7787FEC702250F9',
      'db813267-25e6-4bef-ba14-ea8b41d491c6',
      '255.203',
      'visible large diagonal/diamond quilt seams',
      'project owner rejected it',
      'That exact candidate remains rejected historical evidence.',
      'GIMP 3.2.4',
      '2E94BBE46A3E901BB8EB14B21F413E8ACCB850D3443FFD72308D63B09DCDBC7B',
      '6419C1E81F13FF75650A13F1FE6654711A7334C9A24EC48F86C4356533CF8095',
      '73118EE47A92EEA00DD78D11508F4031EA532B8DB798030B56E48A19C951C71D',
      '0DBA3767ECDF3B92A1C26653F899950FD1E8998E035BE7FB22B3EFFA2D4ED0CA',
      'D50C2C60A9941DEF0CD9E1C3C98A205A329CCFEC8766F3B1B70456728E2E40E9',
      'No new FLUX request, inference, reference, post-export paint, runtime integration, terrain authority, or further generation is authorized.'
    ]
  }]
]);

function collectPlaceholders(value, result = []) {
  if (typeof value === 'string' && value.startsWith('PARAM_')) result.push(value);
  if (Array.isArray(value)) {
    for (const item of value) collectPlaceholders(item, result);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectPlaceholders(item, result);
  }
  return result;
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateGenerationComponents(manifest, root = repoRoot) {
  const errors = [];
  const components = manifest?.components;

  if (manifest?.schema_version !== 1) errors.push('schema_version must be 1.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest?.checked_date || '')) {
    errors.push('checked_date must use YYYY-MM-DD.');
  }
  if (manifest?.policy?.distribution !== 'external_not_bundled') {
    errors.push('policy must keep third-party generation components external and unbundled.');
  }
  if (manifest?.policy?.project_workflow_distribution !== 'source_tooling_only_not_product_runtime') {
    errors.push('project workflows must remain source tooling and outside product runtime assets.');
  }
  if (manifest?.policy?.profile_selection !== 'closed_manifest_profiles_only') {
    errors.push('generation profile selection must remain closed to manifest-defined profiles.');
  }
  if (manifest?.policy?.conditioning_input_state !== 'project_owned_documentation_only_until_generated_output_review') {
    errors.push('conditioning inputs must remain project-owned documentation references until output review.');
  }
  if (manifest?.policy?.generated_output_state !== 'quarantined_candidate_until_exact_file_approval') {
    errors.push('generated output must remain quarantined until exact-file approval.');
  }
  if (!Array.isArray(components)) return [...errors, 'components must be an array.'];

  const ids = new Set();
  for (const component of components) {
    const label = component?.id || '<missing id>';
    if (!/^[a-z0-9][a-z0-9-]*$/.test(component?.id || '')) errors.push(`${label}: invalid component id.`);
    if (ids.has(component?.id)) errors.push(`${label}: duplicate component id.`);
    ids.add(component?.id);

    for (const field of ['id', 'kind', 'version', 'license', 'license_evidence', 'distribution', 'notes']) {
      if (typeof component?.[field] !== 'string' || !component[field]) {
        errors.push(`${label}: missing ${field}.`);
      }
    }
    if (!allowedKinds.has(component?.kind)) errors.push(`${label}: invalid kind.`);
    if (component?.distribution === 'external_not_bundled') {
      if (!/^https:\/\//.test(component?.source_url || '')) errors.push(`${label}: source_url must be HTTPS.`);
      if (!/^https:\/\//.test(component?.license_evidence || '')) errors.push(`${label}: license_evidence must be HTTPS.`);
      if (!/^[0-9a-f]{40}$/.test(component?.revision || '')) errors.push(`${label}: revision must be a full Git hash.`);
    } else if (component?.distribution === 'project_source_tooling') {
      if (component.kind !== 'generation_workflow') {
        errors.push(`${label}: only a project-owned generation workflow may use project_source_tooling.`);
      }
      if (component.license !== 'MIT' || component.license_evidence !== 'LICENSE') {
        errors.push(`${label}: project source tooling must use the repository MIT license.`);
      }
    } else {
      errors.push(`${label}: invalid component distribution; third-party components must remain external and unbundled.`);
    }
    if (component?.kind === 'external_generation_tool' || component?.kind === 'external_generation_bridge') {
      if (!Array.isArray(component.allowed_untracked_paths) ||
          component.allowed_untracked_paths.some((entry) => typeof entry !== 'string' || !entry)) {
        errors.push(`${label}: allowed_untracked_paths must be an explicit string array.`);
      }
    }
    for (const field of ['approved_uses', 'blocked_uses']) {
      if (!Array.isArray(component?.[field]) || component[field].length === 0 ||
          component[field].some((entry) => typeof entry !== 'string' || !entry)) {
        errors.push(`${label}: ${field} must be a non-empty string array.`);
      }
    }
    if (modelFileKinds.has(component?.kind)) {
      if (!/^[0-9A-F]{64}$/.test(component.file_sha256 || '')) {
        errors.push(`${label}: file_sha256 must be 64 uppercase hexadecimal characters.`);
      }
      if (!Number.isInteger(component.file_size) || component.file_size <= 0) {
        errors.push(`${label}: file_size must be a positive integer.`);
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.safetensors$/.test(component.file_name || '')) {
        errors.push(`${label}: file_name must identify one safetensors file.`);
      }
    }
  }

  for (const id of requiredIds) {
    if (!ids.has(id)) errors.push(`missing required component ${id}.`);
  }

  const conditioningInputs = manifest?.conditioning_inputs;
  if (!Array.isArray(conditioningInputs)) {
    errors.push('conditioning_inputs must be an array.');
  } else {
    const conditioningIds = new Set();
    for (const input of conditioningInputs) {
      const label = input?.id || '<missing conditioning input id>';
      if (!/^[a-z0-9][a-z0-9-]*$/.test(input?.id || '')) errors.push(`${label}: invalid conditioning input id.`);
      if (conditioningIds.has(input?.id)) errors.push(`${label}: duplicate conditioning input id.`);
      conditioningIds.add(input?.id);
      if (input?.license !== 'MIT' || input?.distribution !== 'documentation_conditioning_only') {
        errors.push(`${label}: project-owned conditioning inputs must remain MIT documentation-only material.`);
      }
      for (const field of ['approved_uses', 'blocked_uses']) {
        if (!Array.isArray(input?.[field]) || input[field].length === 0 ||
            input[field].some((entry) => typeof entry !== 'string' || !entry)) {
          errors.push(`${label}: ${field} must be a non-empty string array.`);
        }
      }

      const contract = reviewedConditioningInputContracts.get(input?.id);
      if (!contract) {
        errors.push(`${label}: arbitrary conditioning inputs are blocked.`);
        continue;
      }
      if (input.kind !== contract.kind) errors.push(`${label}: reviewed conditioning kind changed.`);
      if (input.source_path !== contract.sourcePath) errors.push(`${label}: reviewed conditioning source_path changed.`);
      if (input.generator_path !== contract.generatorPath) errors.push(`${label}: reviewed conditioning generator_path changed.`);
      if (input.width !== contract.width || input.height !== contract.height) {
        errors.push(`${label}: reviewed conditioning dimensions changed.`);
      }
      if (input.file_size !== contract.fileSize || input.file_sha256 !== contract.fileSha256) {
        errors.push(`${label}: reviewed conditioning file size or hash changed.`);
      }
      if (input.generator_sha256 !== contract.generatorSha256) {
        errors.push(`${label}: reviewed conditioning generator hash changed.`);
      }

      const sourcePath = path.resolve(root, input.source_path || '');
      const generatorPath = path.resolve(root, input.generator_path || '');
      const rootPrefix = path.resolve(root) + path.sep;
      if (!sourcePath.startsWith(rootPrefix) || !fs.existsSync(sourcePath)) {
        errors.push(`${label}: conditioning source must resolve inside the repository.`);
      } else {
        const bytes = fs.readFileSync(sourcePath);
        const hash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
        if (bytes.length !== input.file_size || hash !== input.file_sha256) {
          errors.push(`${label}: conditioning source bytes do not match the manifest.`);
        }
        const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        if (bytes.length < 24 || !bytes.subarray(0, 8).equals(pngSignature) ||
            bytes.readUInt32BE(16) !== input.width || bytes.readUInt32BE(20) !== input.height) {
          errors.push(`${label}: conditioning source must be the reviewed PNG dimensions.`);
        }
      }
      if (!generatorPath.startsWith(rootPrefix) || !fs.existsSync(generatorPath)) {
        errors.push(`${label}: conditioning generator must resolve inside the repository.`);
      } else {
        const generatorHash = crypto.createHash('sha256').update(fs.readFileSync(generatorPath)).digest('hex').toUpperCase();
        if (generatorHash !== input.generator_sha256) {
          errors.push(`${label}: conditioning generator bytes do not match the manifest.`);
        }
      }
    }
    for (const inputId of reviewedConditioningInputContracts.keys()) {
      if (!conditioningIds.has(inputId)) errors.push(`missing required conditioning input ${inputId}.`);
    }
    if (conditioningInputs.length !== reviewedConditioningInputContracts.size) {
      errors.push('conditioning input count must remain closed to the reviewed set.');
    }
  }

  for (const [id, contract] of reviewedModelContracts) {
    const component = components.find((candidate) => candidate.id === id);
    if (!component) continue;
    if (component.kind !== contract.kind) errors.push(`${id}: unexpected reviewed model kind.`);
    if (component.file_name !== contract.fileName) errors.push(`${id}: unexpected reviewed file_name.`);
    if (component.file_size !== contract.fileSize) errors.push(`${id}: unexpected reviewed file_size.`);
    if (component.file_sha256 !== contract.fileSha256) errors.push(`${id}: unexpected reviewed file_sha256.`);
    if (component.license !== contract.license) errors.push(`${id}: model license must remain explicit as ${contract.license}.`);
    if (contract.sourceRelation && component.source_relation !== contract.sourceRelation) {
      errors.push(`${id}: source_relation must remain ${contract.sourceRelation}.`);
    }
    if (contract.sourceRelation === 'deterministic_repackage') {
      if (!/^https:\/\//.test(component.canonical_source_url || '')) {
        errors.push(`${id}: canonical_source_url must be HTTPS for a deterministic repackage.`);
      }
      if (!/^[0-9a-f]{40}$/.test(component.canonical_revision || '')) {
        errors.push(`${id}: canonical_revision must be a full Git hash for a deterministic repackage.`);
      }
      if (!Array.isArray(component.compatibility_evidence) || component.compatibility_evidence.length === 0 ||
          component.compatibility_evidence.some((entry) => typeof entry !== 'string' || !entry)) {
        errors.push(`${id}: compatibility_evidence must bind a deterministic repackage to its canonical component.`);
      }
      if (!Array.isArray(component.provenance_inputs) || component.provenance_inputs.length === 0 ||
          component.provenance_inputs.some((entry) =>
            typeof entry?.file_name !== 'string' || !entry.file_name ||
            !Number.isInteger(entry.file_size) || entry.file_size <= 0 ||
            !/^[0-9A-F]{64}$/.test(entry.file_sha256 || '') ||
            !/^https:\/\//.test(entry.source_url || ''))) {
        errors.push(`${id}: provenance_inputs must exact-hash every canonical repackage input.`);
      }
      if (typeof component.repackage_recipe !== 'string' || !component.repackage_recipe) {
        errors.push(`${id}: repackage_recipe must describe the deterministic external transformation.`);
      }
    }
  }

  const bridge = components.find((component) => component.id === 'comfyui-mcp-server');
  if (bridge) {
    if (!/^\d+\.\d+\.\d+$/.test(bridge.python_version || '')) {
      errors.push(`${bridge.id}: python_version must be exact.`);
    }
    if (!/^[0-9A-F]{64}$/.test(bridge.requirements_lock_sha256 || '')) {
      errors.push(`${bridge.id}: requirements_lock_sha256 must be exact.`);
    }
    if (!/^[0-9A-F]{64}$/.test(bridge.local_config_sha256 || '')) {
      errors.push(`${bridge.id}: local_config_sha256 must be exact.`);
    }
    const expectedUntrackedPaths = [
      '.venv/',
      'logs/',
      'workflows/generate_image_conditioned.json',
      'workflows/generate_flux2_klein_protected_edit.json',
      'workflows/generate_flux2_klein_reference_edit.json',
      'workflows/generate_flux2_klein_text.json'
    ];
    if (!sameArray(bridge.allowed_untracked_paths, expectedUntrackedPaths)) {
      errors.push(`${bridge.id}: allowed_untracked_paths must remain the exact reviewed runtime set.`);
    }
    const lockPath = path.resolve(root, bridge.requirements_lock || '');
    if (!lockPath.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(lockPath)) {
      errors.push(`${bridge.id}: requirements_lock must resolve inside the repository.`);
    } else {
      const actualHash = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex').toUpperCase();
      if (actualHash !== bridge.requirements_lock_sha256) {
        errors.push(`${bridge.id}: requirements lock hash mismatch.`);
      }
    }
  }

  const comfy = components.find((component) => component.id === 'comfyui');
  if (comfy && !/^[0-9A-F]{64}$/.test(comfy.local_launcher_sha256 || '')) {
    errors.push(`${comfy.id}: local_launcher_sha256 must be exact.`);
  }
  if (comfy && !/^[0-9A-F]{64}$/.test(comfy.local_extra_model_paths_sha256 || '')) {
    errors.push(`${comfy.id}: local_extra_model_paths_sha256 must be exact.`);
  }

  const workflows = components.filter((component) => component.kind === 'generation_workflow');
  for (const workflow of workflows) {
    if (!/^[0-9A-F]{64}$/.test(workflow.file_sha256 || '')) {
      errors.push(`${workflow.id}: file_sha256 must be exact.`);
    }
    const runtimePath = workflow.file_path || workflow.runtime_path;
    if (!/^workflows\/[a-z0-9][a-z0-9._-]*\.json$/.test(runtimePath || '')) {
      errors.push(`${workflow.id}: runtime workflow path must name one JSON file below workflows/.`);
    }
    if (!['text_to_image', 'image_to_image', 'masked_image_to_image'].includes(workflow.input_mode)) {
      errors.push(`${workflow.id}: input_mode must disclose text_to_image, image_to_image, or masked_image_to_image.`);
    }
    const contract = reviewedFluxWorkflowContracts.get(workflow.id);
    if (workflow.runtime_enabled !== true && contract?.runtimeEnabled !== false) {
      errors.push(`${workflow.id}: reviewed workflow must be runtime-enabled only through a closed profile.`);
    }
    if (workflow.distribution === 'project_source_tooling') {
      if (!/^scripts\/comfy-workflows\/[a-z0-9][a-z0-9._-]*\.json$/.test(workflow.source_path || '')) {
        errors.push(`${workflow.id}: source_path must name one JSON file below scripts/comfy-workflows/.`);
        continue;
      }
      const sourcePath = path.resolve(root, workflow.source_path);
      if (!sourcePath.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(sourcePath)) {
        errors.push(`${workflow.id}: source_path must resolve inside the repository.`);
        continue;
      }
      const actualHash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex').toUpperCase();
      if (actualHash !== workflow.file_sha256) {
        errors.push(`${workflow.id}: project workflow hash mismatch.`);
      }
    }

    if (!contract) continue;
    if (workflow.source_path !== contract.sourcePath) errors.push(`${workflow.id}: reviewed source_path changed.`);
    if (workflow.runtime_path !== contract.runtimePath) errors.push(`${workflow.id}: reviewed runtime_path changed.`);
    if (workflow.input_mode !== contract.inputMode) errors.push(`${workflow.id}: reviewed input_mode changed.`);
    if (workflow.source_template_url !== contract.sourceTemplateUrl) {
      errors.push(`${workflow.id}: official source_template_url changed.`);
    }
    if (workflow.source_template_revision !== contract.sourceTemplateRevision) {
      errors.push(`${workflow.id}: official source_template_revision changed.`);
    }
    if (workflow.comfyui_revision !== 'c2638ce6c00e3426c48d56a775bc46e9a8464094') {
      errors.push(`${workflow.id}: ComfyUI compatibility revision changed.`);
    }
    if (!sameArray(workflow.model_components, reviewedFluxModelComponents)) {
      errors.push(`${workflow.id}: reviewed FLUX model component set changed.`);
    }
    if (workflow.core_nodes_only !== true) errors.push(`${workflow.id}: core_nodes_only must remain true.`);
    if (workflow.runtime_enabled !== contract.runtimeEnabled) {
      errors.push(`${workflow.id}: reviewed runtime-enabled state changed.`);
    }

    const sourcePath = path.resolve(root, contract.sourcePath);
    if (!fs.existsSync(sourcePath)) continue;
    let graph;
    try {
      graph = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    } catch {
      errors.push(`${workflow.id}: source workflow must contain valid JSON.`);
      continue;
    }
    const nodes = Object.values(graph);
    const actualClasses = nodes.map((node) => node?.class_type).sort();
    const expectedClasses = [...contract.nodeClasses].sort();
    if (!sameArray(actualClasses, expectedClasses)) {
      errors.push(`${workflow.id}: reviewed core node set changed.`);
    }
    const placeholders = [...new Set(collectPlaceholders(graph))].sort();
    if (!sameArray(placeholders, [...contract.placeholders].sort())) {
      errors.push(`${workflow.id}: reviewed parameter placeholder set changed.`);
    }

    const onlyNode = (classType) => nodes.find((node) => node?.class_type === classType);
    if (onlyNode('UNETLoader')?.inputs?.unet_name !== 'flux-2-klein-4b-fp8.safetensors') {
      errors.push(`${workflow.id}: reviewed diffusion-model filename changed.`);
    }
    const clip = onlyNode('CLIPLoader');
    if (clip?.inputs?.clip_name !== 'qwen_3_4b_bfl_apache.safetensors' || clip?.inputs?.type !== 'flux2') {
      errors.push(`${workflow.id}: reviewed FLUX.2 text-encoder binding changed.`);
    }
    if (onlyNode('VAELoader')?.inputs?.vae_name !== 'flux2-vae.safetensors') {
      errors.push(`${workflow.id}: reviewed VAE filename changed.`);
    }
    if (onlyNode('Flux2Scheduler')?.inputs?.steps !== 4) {
      errors.push(`${workflow.id}: distilled schedule must remain four steps.`);
    }
    if (onlyNode('CFGGuider')?.inputs?.cfg !== 1) {
      errors.push(`${workflow.id}: distilled CFG must remain 1.`);
    }
    if (onlyNode('KSamplerSelect')?.inputs?.sampler_name !== 'euler') {
      errors.push(`${workflow.id}: distilled sampler must remain Euler.`);
    }
    if (workflow.input_mode !== 'masked_image_to_image' &&
        onlyNode('EmptyFlux2LatentImage')?.inputs?.batch_size !== 1) {
      errors.push(`${workflow.id}: batch size must remain one.`);
    }
    if (workflow.input_mode === 'text_to_image') {
      const latent = onlyNode('EmptyFlux2LatentImage');
      const scheduler = onlyNode('Flux2Scheduler');
      if (latent?.inputs?.width !== 1024 || latent?.inputs?.height !== 1024 ||
          scheduler?.inputs?.width !== 1024 || scheduler?.inputs?.height !== 1024) {
        errors.push(`${workflow.id}: text canvas and schedule must remain 1024x1024.`);
      }
    } else {
      const scale = onlyNode('ImageScaleToTotalPixels');
      if (scale?.inputs?.megapixels !== 1 || scale?.inputs?.resolution_steps !== 1 ||
          scale?.inputs?.upscale_method !== 'nearest-exact') {
        errors.push(`${workflow.id}: reference preprocessing must remain bounded to one megapixel.`);
      }
      const loadImages = nodes.filter((node) => node?.class_type === 'LoadImage');
      if (!loadImages.some((node) => node?.inputs?.image === 'PARAM_STR_REFERENCE_IMAGE')) {
        errors.push(`${workflow.id}: reference input must remain an explicit staged filename parameter.`);
      }
      if (workflow.input_mode === 'masked_image_to_image') {
        if (loadImages.length !== 2 ||
            !loadImages.some((node) => node?.inputs?.image === 'PARAM_STR_MASK_IMAGE')) {
          errors.push(`${workflow.id}: protected edit must expose exactly one staged base and one staged mask.`);
        }
        if (onlyNode('ImageToMask')?.inputs?.channel !== 'red') {
          errors.push(`${workflow.id}: protected edit must read the reviewed grayscale mask from its red channel.`);
        }
        if (onlyNode('EmptyFlux2LatentImage')) {
          errors.push(`${workflow.id}: protected edit must sample from the encoded base, not an empty latent.`);
        }
        const latentMask = onlyNode('SetLatentNoiseMask');
        const sampler = onlyNode('SamplerCustomAdvanced');
        const composite = onlyNode('ImageCompositeMasked');
        const baseEncode = onlyNode('VAEEncode');
        const maskNode = onlyNode('ImageToMask');
        const decoded = onlyNode('VAEDecode');
        const baseScale = onlyNode('ImageScaleToTotalPixels');
        const maskScale = onlyNode('ImageScale');
        const imageSize = onlyNode('GetImageSize');
        const references = nodes.filter((node) => node?.class_type === 'ReferenceLatent');
        const baseLoad = loadImages.find((node) => node?.inputs?.image === 'PARAM_STR_REFERENCE_IMAGE');
        const maskLoad = loadImages.find((node) => node?.inputs?.image === 'PARAM_STR_MASK_IMAGE');
        const expectedLink = (value, sourceNode, output = 0) =>
          sameArray(value, [String(sourceNode), output]);
        const findId = (target) => Object.entries(graph).find(([, node]) => node === target)?.[0];
        const latentMaskId = findId(latentMask);
        const maskNodeId = findId(maskNode);
        const baseEncodeId = findId(baseEncode);
        const decodedId = findId(decoded);
        const baseScaleId = findId(baseScale);
        const maskScaleId = findId(maskScale);
        const imageSizeId = findId(imageSize);
        const baseLoadId = findId(baseLoad);
        const maskLoadId = findId(maskLoad);
        if (!expectedLink(baseScale?.inputs?.image, baseLoadId) ||
            !expectedLink(imageSize?.inputs?.image, baseScaleId) ||
            !expectedLink(baseEncode?.inputs?.pixels, baseScaleId) ||
            references.length !== 2 ||
            references.some((reference) => !expectedLink(reference?.inputs?.latent, baseEncodeId))) {
          errors.push(`${workflow.id}: B2D must remain the bounded base latent and sole model reference.`);
        }
        if (!expectedLink(maskScale?.inputs?.image, maskLoadId) ||
            !expectedLink(maskScale?.inputs?.width, imageSizeId, 0) ||
            !expectedLink(maskScale?.inputs?.height, imageSizeId, 1) ||
            maskScale?.inputs?.upscale_method !== 'nearest-exact' ||
            maskScale?.inputs?.crop !== 'disabled' ||
            !expectedLink(maskNode?.inputs?.image, maskScaleId)) {
          errors.push(`${workflow.id}: staged mask must size-match B2D before red-channel extraction.`);
        }
        if (!expectedLink(latentMask?.inputs?.samples, baseEncodeId) ||
            !expectedLink(latentMask?.inputs?.mask, maskNodeId) ||
            !expectedLink(sampler?.inputs?.latent_image, latentMaskId)) {
          errors.push(`${workflow.id}: noise mask must constrain the encoded B2D base supplied to the sampler.`);
        }
        if (!expectedLink(composite?.inputs?.destination, baseScaleId) ||
            !expectedLink(composite?.inputs?.source, decodedId) ||
            !expectedLink(composite?.inputs?.mask, maskNodeId) ||
            composite?.inputs?.resize_source !== false) {
          errors.push(`${workflow.id}: final composite must restore protected B2D pixels outside the same mask.`);
        }
        if (nodes.some((node) => ['InpaintModelConditioning', 'DifferentialDiffusion'].includes(node?.class_type))) {
          errors.push(`${workflow.id}: model-dependent or experimental inpaint nodes are blocked.`);
        }
      }
    }
  }

  const profiles = manifest?.profiles;
  if (!Array.isArray(profiles)) {
    errors.push('profiles must be an array.');
  } else {
    const profileIds = new Set();
    for (const profile of profiles) {
      const label = profile?.id || '<missing profile id>';
      if (!/^[a-z0-9][a-z0-9-]*$/.test(profile?.id || '')) errors.push(`${label}: invalid profile id.`);
      if (profileIds.has(profile?.id)) errors.push(`${label}: duplicate profile id.`);
      profileIds.add(profile?.id);
      if (profile?.runtime_enabled !== true) errors.push(`${label}: reviewed profile must be runtime-enabled.`);
      if (typeof profile?.notes !== 'string' || !profile.notes) errors.push(`${label}: missing profile notes.`);

      const contract = reviewedProfileContracts.get(profile?.id);
      if (!contract) {
        errors.push(`${label}: arbitrary generation profiles are blocked.`);
        continue;
      }
      if (profile.state !== contract.state) errors.push(`${label}: reviewed profile state changed.`);
      if (!sameArray(profile.model_components, contract.modelComponents)) {
        errors.push(`${label}: reviewed model component chain changed.`);
      }
      if (!sameArray(profile.workflow_components, contract.workflowComponents)) {
        errors.push(`${label}: reviewed workflow component chain changed.`);
      }
      if (!sameArray(profile.required_mcp_tools, contract.requiredMcpTools)) {
        errors.push(`${label}: reviewed MCP tool registration set changed.`);
      }
      if (profile.comfy_launch_mode !== contract.comfyLaunchMode) {
        errors.push(`${label}: reviewed Comfy launch mode changed.`);
      }
      if (!sameArray(profile.required_comfy_arguments, contract.requiredComfyArguments)) {
        errors.push(`${label}: reviewed Comfy launch arguments changed.`);
      }
      if (profile.smoke_tool !== contract.smokeTool ||
          !contract.requiredMcpTools.includes(profile.smoke_tool)) {
        errors.push(`${label}: reviewed smoke tool changed or is not registered by the profile.`);
      }
      if (contract.latestReview && JSON.stringify(profile.latest_review) !== JSON.stringify(contract.latestReview)) {
        errors.push(`${label}: latest exact-output review changed.`);
      }
      if (contract.authorizedRequest &&
          JSON.stringify(profile.authorized_request) !== JSON.stringify(contract.authorizedRequest)) {
        errors.push(`${label}: exact authorized generation request changed.`);
      }
      if (contract.threadballReview &&
          JSON.stringify(profile.threadball_source_master_review) !== JSON.stringify(contract.threadballReview)) {
        errors.push(`${label}: exact Threadball source-master review changed.`);
      }
      if (contract.cloudAuthorizedRequest &&
          JSON.stringify(profile.cloud_authorized_request) !== JSON.stringify(contract.cloudAuthorizedRequest)) {
        errors.push(`${label}: exact Cloud authorized generation request changed.`);
      }
      if (contract.cloudReview &&
          JSON.stringify(profile.cloud_source_master_review) !== JSON.stringify(contract.cloudReview)) {
        errors.push(`${label}: exact Cloud source-master review changed.`);
      }
      if (contract.terrainTopAuthorizedRequest &&
          JSON.stringify(profile.terrain_top_authorized_request) !== JSON.stringify(contract.terrainTopAuthorizedRequest)) {
        errors.push(`${label}: exact Terrain Top authorized generation request changed.`);
      }
      if (contract.terrainTopReview &&
          JSON.stringify(profile.terrain_top_source_master_review) !== JSON.stringify(contract.terrainTopReview)) {
        errors.push(`${label}: exact Terrain Top source-master review changed.`);
      }
      if (contract.terrainInteriorAuthorizedRequest &&
          JSON.stringify(profile.terrain_interior_authorized_request) !== JSON.stringify(contract.terrainInteriorAuthorizedRequest)) {
        errors.push(`${label}: exact Terrain Interior authorized generation request changed.`);
      }
      if (contract.terrainInteriorManualRepairReview &&
          JSON.stringify(profile.terrain_interior_manual_repair_review) !==
          JSON.stringify(contract.terrainInteriorManualRepairReview)) {
        errors.push(`${label}: exact Terrain Interior manual-repair review changed.`);
      }
      if (contract.latestReview) {
        const exactFiles = [
          ['normalization_config_path', 'normalization_config_sha256'],
          ['normalizer_path', 'normalizer_sha256'],
          ['normalized_master_path', 'normalized_master_sha256']
        ];
        for (const [pathField, hashField] of exactFiles) {
          const relativePath = profile.latest_review?.[pathField] || '';
          const resolvedPath = path.resolve(root, relativePath);
          if (!relativePath || !resolvedPath.startsWith(path.resolve(root) + path.sep) ||
              !fs.existsSync(resolvedPath)) {
            errors.push(`${label}: ${pathField} must resolve inside the repository.`);
            continue;
          }
          const actualHash = crypto.createHash('sha256').update(fs.readFileSync(resolvedPath))
            .digest('hex').toUpperCase();
          if (actualHash !== profile.latest_review?.[hashField]) {
            errors.push(`${label}: ${pathField} does not match ${hashField}.`);
          }
        }
        const assetManifestPath = path.resolve(root, 'legal', 'asset-manifest.json');
        const assetManifest = fs.existsSync(assetManifestPath) ?
          JSON.parse(fs.readFileSync(assetManifestPath, 'utf8')) : null;
        const approvedMaster = assetManifest?.assets?.find(
          (asset) => asset.file === profile.latest_review.normalized_master_path
        );
        if (!approvedMaster || approvedMaster.sha256 !== profile.latest_review.normalized_master_sha256 ||
            approvedMaster.runtime_path !== undefined) {
          errors.push(`${label}: approved normalized master must remain manifest-bound without runtime_path.`);
        }
      }
      if (contract.threadballReview) {
        const exactFiles = [
          ['normalization_config_path', 'normalization_config_sha256'],
          ['normalizer_path', 'normalizer_sha256'],
          ['normalized_master_path', 'normalized_master_sha256']
        ];
        for (const [pathField, hashField] of exactFiles) {
          const relativePath = profile.threadball_source_master_review?.[pathField] || '';
          const resolvedPath = path.resolve(root, relativePath);
          if (!relativePath || !resolvedPath.startsWith(path.resolve(root) + path.sep) ||
              !fs.existsSync(resolvedPath)) {
            errors.push(`${label}: Threadball ${pathField} must resolve inside the repository.`);
            continue;
          }
          const actualHash = crypto.createHash('sha256').update(fs.readFileSync(resolvedPath))
            .digest('hex').toUpperCase();
          if (actualHash !== profile.threadball_source_master_review?.[hashField]) {
            errors.push(`${label}: Threadball ${pathField} does not match ${hashField}.`);
          }
        }
        const assetManifestPath = path.resolve(root, 'legal', 'asset-manifest.json');
        const assetManifest = fs.existsSync(assetManifestPath) ?
          JSON.parse(fs.readFileSync(assetManifestPath, 'utf8')) : null;
        const approvedMaster = assetManifest?.assets?.find(
          (asset) => asset.file === profile.threadball_source_master_review.normalized_master_path
        );
        if (!approvedMaster ||
            approvedMaster.sha256 !== profile.threadball_source_master_review.normalized_master_sha256 ||
            approvedMaster.runtime_path !== undefined) {
          errors.push(`${label}: approved Threadball source master must remain manifest-bound without runtime_path.`);
        }
      }
      if (contract.cloudReview) {
        const exactFiles = [
          ['normalization_config_path', 'normalization_config_sha256'],
          ['normalizer_path', 'normalizer_sha256'],
          ['normalized_master_path', 'normalized_master_sha256']
        ];
        for (const [pathField, hashField] of exactFiles) {
          const relativePath = profile.cloud_source_master_review?.[pathField] || '';
          const resolvedPath = path.resolve(root, relativePath);
          if (!relativePath || !resolvedPath.startsWith(path.resolve(root) + path.sep) ||
              !fs.existsSync(resolvedPath)) {
            errors.push(`${label}: Cloud ${pathField} must resolve inside the repository.`);
            continue;
          }
          const actualHash = crypto.createHash('sha256').update(fs.readFileSync(resolvedPath))
            .digest('hex').toUpperCase();
          if (actualHash !== profile.cloud_source_master_review?.[hashField]) {
            errors.push(`${label}: Cloud ${pathField} does not match ${hashField}.`);
          }
        }
        const assetManifestPath = path.resolve(root, 'legal', 'asset-manifest.json');
        const assetManifest = fs.existsSync(assetManifestPath) ?
          JSON.parse(fs.readFileSync(assetManifestPath, 'utf8')) : null;
        const approvedMaster = assetManifest?.assets?.find(
          (asset) => asset.file === profile.cloud_source_master_review.normalized_master_path
        );
        if (!approvedMaster ||
            approvedMaster.sha256 !== profile.cloud_source_master_review.normalized_master_sha256 ||
            approvedMaster.runtime_path !== undefined) {
          errors.push(`${label}: approved Cloud source master must remain manifest-bound without runtime_path.`);
        }
      }
      if (contract.terrainTopReview) {
        const exactFiles = [
          ['normalization_config_path', 'normalization_config_sha256'],
          ['normalizer_path', 'normalizer_sha256'],
          ['normalized_master_path', 'normalized_master_sha256']
        ];
        for (const [pathField, hashField] of exactFiles) {
          const relativePath = profile.terrain_top_source_master_review?.[pathField] || '';
          const resolvedPath = path.resolve(root, relativePath);
          if (!relativePath || !resolvedPath.startsWith(path.resolve(root) + path.sep) ||
              !fs.existsSync(resolvedPath)) {
            errors.push(`${label}: Terrain Top ${pathField} must resolve inside the repository.`);
            continue;
          }
          const actualHash = crypto.createHash('sha256').update(fs.readFileSync(resolvedPath))
            .digest('hex').toUpperCase();
          if (actualHash !== profile.terrain_top_source_master_review?.[hashField]) {
            errors.push(`${label}: Terrain Top ${pathField} does not match ${hashField}.`);
          }
        }
        const assetManifestPath = path.resolve(root, 'legal', 'asset-manifest.json');
        const assetManifest = fs.existsSync(assetManifestPath) ?
          JSON.parse(fs.readFileSync(assetManifestPath, 'utf8')) : null;
        const approvedMaster = assetManifest?.assets?.find(
          (asset) => asset.file === profile.terrain_top_source_master_review.normalized_master_path
        );
        if (!approvedMaster ||
            approvedMaster.sha256 !== profile.terrain_top_source_master_review.normalized_master_sha256 ||
            approvedMaster.runtime_path !== undefined) {
          errors.push(`${label}: approved Terrain Top source master must remain manifest-bound without runtime_path.`);
        }
      }
      if (contract.terrainInteriorManualRepairReview) {
        const exactFiles = [
          ['normalization_config_path', 'normalization_config_sha256'],
          ['normalizer_path', 'normalizer_sha256'],
          ['normalized_master_path', 'normalized_master_sha256']
        ];
        for (const [pathField, hashField] of exactFiles) {
          const relativePath = profile.terrain_interior_manual_repair_review?.[pathField] || '';
          const resolvedPath = path.resolve(root, relativePath);
          if (!relativePath || !resolvedPath.startsWith(path.resolve(root) + path.sep) ||
              !fs.existsSync(resolvedPath)) {
            errors.push(`${label}: Terrain Interior manual repair ${pathField} must resolve inside the repository.`);
            continue;
          }
          const actualHash = crypto.createHash('sha256').update(fs.readFileSync(resolvedPath))
            .digest('hex').toUpperCase();
          if (actualHash !== profile.terrain_interior_manual_repair_review?.[hashField]) {
            errors.push(`${label}: Terrain Interior manual repair ${pathField} does not match ${hashField}.`);
          }
        }
        const assetManifestPath = path.resolve(root, 'legal', 'asset-manifest.json');
        const assetManifest = fs.existsSync(assetManifestPath) ?
          JSON.parse(fs.readFileSync(assetManifestPath, 'utf8')) : null;
        const approvedMaster = assetManifest?.assets?.find(
          (asset) => asset.file === profile.terrain_interior_manual_repair_review.normalized_master_path
        );
        if (!approvedMaster ||
            approvedMaster.sha256 !== profile.terrain_interior_manual_repair_review.normalized_master_sha256 ||
            approvedMaster.runtime_path !== undefined) {
          errors.push(`${label}: approved manual-repair Terrain Interior master must remain manifest-bound without runtime_path.`);
        }
      }
      if (Array.isArray(contract.requiredNoteFragments) &&
          contract.requiredNoteFragments.some((fragment) => !profile.notes.includes(fragment))) {
        errors.push(`${label}: profile notes do not bind the reviewed bounded request.`);
      }

      for (const componentId of profile.model_components || []) {
        const component = components.find((candidate) => candidate.id === componentId);
        if (!component || !modelFileKinds.has(component.kind)) {
          errors.push(`${label}: model component ${componentId} is missing or is not an exact model file.`);
        }
      }
      for (const componentId of profile.workflow_components || []) {
        const component = components.find((candidate) => candidate.id === componentId);
        if (!component || component.kind !== 'generation_workflow' || component.runtime_enabled !== true) {
          errors.push(`${label}: workflow component ${componentId} is missing or not runtime-enabled.`);
        }
      }
    }
    for (const profileId of reviewedProfileContracts.keys()) {
      if (!profileIds.has(profileId)) errors.push(`missing required generation profile ${profileId}.`);
    }
    if (profiles.length !== reviewedProfileContracts.size) {
      errors.push('generation profile count must remain closed to the reviewed set.');
    }
  }

  return errors;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = validateGenerationComponents(manifest);
  if (errors.length > 0) {
    console.error('Generation-component compliance failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Generation-component compliance passed (${manifest.components.length} component(s), ${manifest.profiles.length} profile(s)).`);
}

if (require.main === module) main();

module.exports = { validateGenerationComponents };
