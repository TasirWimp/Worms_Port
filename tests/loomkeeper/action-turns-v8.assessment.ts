import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import {
    advanceSimulationTicksV8, applySimulationBarrierV8, applySimulationIntentV8,
    assertSimulationInvariantsV8Family, cloneSimulationV8, createSimulationV8, V8_R1_RULESET_ID,
    type SimulationStateV8Family
} from '../../shared/simulation-v8';
import {
    advanceSimulationTicks, applySimulationCommand, assertSimulationInvariants, canonicalSimulationJson,
    cloneSimulation, createSimulation, setTerrainSolid, terrainSolid, V7_RULESET_ID,
    type PlayerCalling, type SimulationActor, type SimulationCommand, type SimulationState
} from '../../shared/simulation';
import { decideLoomkeeperTurn } from '../../shared/loomkeeper';
import { candidateAt, LoomkeeperExecutionV8, LoomkeeperPlannerV8 } from '../../shared/loomkeeper-v8';
import { hashSimulationStateV8 } from '../../server/src/simulation/coordinator-v8';

const SEEDS=[1,2,3,4,17,42,1337,65535,2147483648,4294967295] as const;
const SCRIPTS=[0,1,4] as const;
type TraceOperationV8={kind:'ticks';count:1}|{kind:'intent';actor:SimulationActor;intent:any;turn:number;phase:any;epoch:number}|
    {kind:'barrier';barrier:any};
type TraceOperationV7={kind:'ticks';count:number}|{kind:'command';actor:SimulationActor;command:SimulationCommand};
type Scenario={seed:number;reflected:boolean;firstActor:SimulationActor;scriptIndex:0|1|4;
    scriptId:'stationary'|'toward-90'|'toward-90-jump'};

test('V8 admission assessment: frozen 120 paired scenarios and V7 controls',async t=>{
    const started=performance.now();
    const scenarios:Scenario[]=[];
    for(const seed of SEEDS)for(const reflected of [false,true])for(const firstActor of ['player','loomkeeper'] as const)
        for(const scriptIndex of SCRIPTS)scenarios.push({seed,reflected,firstActor,scriptIndex,
            scriptId:scriptIndex===0?'stationary':scriptIndex===1?'toward-90':'toward-90-jump'});
    assert.equal(scenarios.length,120);
    const v8:ReturnType<typeof runV8>[]=[],v7:ReturnType<typeof runV7>[]=[];
    const correctness:Array<{seed:number;reflected:boolean;calling:PlayerCalling;selection:unknown;executionHashes:string[]}>=[];
    let active:{version:string;scenario:Scenario|{seed:number;reflected:boolean;calling:PlayerCalling}}|null=null;
    const groups=new Map<string,typeof v8>();
    const save=async(failure:string|null)=>{
        const report={assessmentId:'wp-015d3a-v8d-r1-v1',generatedAt:new Date().toISOString(),plannedScenarioCount:240,
            completedScenarioCount:v8.length+v7.length,elapsedMs:Math.round((performance.now()-started)*1000)/1000,
            failure,failedScenario:failure?active:null,correctness:{plannedCases:60,repetitions:2,cases:correctness},
            v8,v7,aggregate:{v8:outcomes(v8),v7:outcomes(v7)},
            groups:[...groups].map(([id,rows])=>({id,...outcomes(rows)}))};
        await mkdir('test-results',{recursive:true});
        await writeFile('test-results/wp-015d3a-v8-assessment.json',`${JSON.stringify(report,null,2)}\n`,'utf8');
        return report;
    };
    try{
        for(const seed of SEEDS)for(const reflected of [false,true])for(const calling of ['wizard','thief','warrior'] as const){
            active={version:'v8-r1-correctness',scenario:{seed,reflected,calling}};
            let source:SimulationStateV8Family=createSimulationV8(seed,calling,V8_R1_RULESET_ID);
            if(reflected)source=reflectV8(source);source.activeActor='loomkeeper';assertSimulationInvariantsV8Family(source);
            const runs=[runCorrectness(source),runCorrectness(source)];assert.deepEqual(runs[0],runs[1]);
            correctness.push({seed,reflected,calling,...runs[0]});
        }
        assert.equal(correctness.length,60);
        for(const scenario of scenarios){active={version:'v8-r1',scenario};const row=runV8(scenario);v8.push(row);
            assert.notEqual(row.terminalReason,'simulation_limit','An aborted/stuck V8 simulation is an admission stop.');}
        for(const scenario of scenarios){active={version:'v7',scenario};v7.push(runV7(scenario));}
        active=null;
        const draws=v8.filter(row=>row.terminalReason==='turn_limit').length;
        assert.ok(v8.every(row=>row.terminal&&row.finalTurn<=16),'Every V8 scenario must terminate within16turns.');
        for(const row of v8){const key=`${row.reflected}/${row.firstActor}/${row.scriptId}`;const group=groups.get(key)??[];group.push(row);groups.set(key,group);}
        assert.ok(draws<=12,`V8 turn-limit draw cap exceeded: ${draws}.`);
        for(const [key,group]of groups){
            const groupDraws=group.filter(row=>row.terminalReason==='turn_limit').length;
            assert.ok(groupDraws<=3,`Group ${key} turn-limit draw cap exceeded: ${groupDraws}.`);
            assert.ok(group.some(row=>row.winner!==row.firstActor),`Group ${key} has ten first-actor wins.`);
        }
        const report=await save(null);
        t.diagnostic(`assessment=${report.elapsedMs}ms; V8 ${JSON.stringify(report.aggregate.v8)}`);
    }catch(error){await save(error instanceof Error?error.message:String(error));throw error;}
});

function runV8(scenario:Scenario){
    const initial=fixtureV8(scenario);let state:SimulationStateV8Family=cloneSimulationV8(initial);const operations:TraceOperationV8[]=[];
    let controller:LoomkeeperExecutionV8|undefined,planner:LoomkeeperPlannerV8|undefined,planning=0,policyTurn=-1,selectionRecorded=false;
    let handovers=0;const first=scenario.firstActor;const openingStart=state.units.map(unit=>unit.stitching);
    let openingEnd:number[]|undefined,replyState:SimulationStateV8Family|undefined,totalPlanningMs=0,maxBatchMs=0,totalRolloutTicks=0;
    const recordTick=()=>{state=advanceSimulationTicksV8(state,1).state;operations.push({kind:'ticks',count:1});};
    while(state.phase!=='finished'){
        if(state.phase==='action'&&policyTurn!==state.turn){
            policyTurn=state.turn;planning=0;controller=undefined;selectionRecorded=false;
            planner=state.activeActor==='loomkeeper'?new LoomkeeperPlannerV8(state):new LoomkeeperPlannerV8(state,{scriptIndex:scenario.scriptIndex});
        }
        if(state.phase==='action'&&planning<30){
            const start=performance.now();planner!.step();const elapsed=performance.now()-start;
            totalPlanningMs+=elapsed;maxBatchMs=Math.max(maxBatchMs,elapsed);planning+=1;
        }
        const beforeActor=state.activeActor;recordTick();
        if(planning===30&&!selectionRecorded&&state.phase==='action'&&state.turn===policyTurn){
            selectionRecorded=true;
            totalRolloutTicks+=planner!.rolloutTicks;
            const selected=planner!.selectedCandidate();if(selected)controller=new LoomkeeperExecutionV8(selected,state);
        }
        if(controller)state=drainV8(state,controller,operations);
        if(state.activeActor!==beforeActor){
            handovers+=1;
            if(!openingEnd){openingEnd=state.units.map(unit=>unit.stitching);replyState=cloneSimulationV8(state);}
        }
        if(state.tick>16800)throw new Error('V8 scenario exceeded its tick cap.');
    }
    if(!openingEnd)openingEnd=state.units.map(unit=>unit.stitching);
    reconstructV8(initial,operations,state);
    const firstIndex=first==='player'?0:1;
    const replyAvailable=Boolean(replyState?.phase==='action'&&replyState.units[1-firstIndex].alive);
    return {...scenario,terminal:true,winner:state.winner,terminalReason:state.finishReason,finalTurn:state.turn,
        completedTurns:handovers,openingDamage:{player:openingStart[0]-openingEnd[0],loomkeeper:openingStart[1]-openingEnd[1]},
        replyAvailable,castAvailable:replyAvailable?castAvailableV8(replyState!):false,
        aiOutcome:state.winner==='loomkeeper'?'win':state.winner==='draw'?'draw':'loss',
        firstActorOutcome:state.winner===first?'win':state.winner==='draw'?'draw':'loss',
        logicalTicks:state.tick,totalRolloutTicks,planningMs:+totalPlanningMs.toFixed(3),maxPlanningBatchMs:+maxBatchMs.toFixed(3),
        firstActorStitching:state.units[firstIndex].stitching,finalStateHash:hashSimulationStateV8(state),replayOperations:operations.length,
        replay:{initialState:initial,operations}};
}

function drainV8(state:SimulationStateV8Family,controller:LoomkeeperExecutionV8,operations:TraceOperationV8[]){
    for(let count=0;count<8;count++){
        const operation=controller.next(state);if(!operation)break;
        if(operation.kind==='intent'){
            const before=state;const transition=applySimulationIntentV8(before,before.activeActor,operation.intent,before.turn,before.phase,before.inputEpoch);
            if(!transition.accepted)throw new Error(`Assessment emitted illegal intent: ${transition.error?.message}`);
            if(transition.mutated)operations.push({kind:'intent',actor:before.activeActor,intent:operation.intent,turn:before.turn,phase:before.phase,epoch:before.inputEpoch});
            state=transition.state;
        }else{
            const transition=applySimulationBarrierV8(state,operation.barrier);
            if(!transition.accepted)throw new Error(`Assessment emitted illegal barrier: ${transition.error?.message}`);
            if(transition.mutated)operations.push({kind:'barrier',barrier:operation.barrier});state=transition.state;
        }
    }
    return state;
}
function reconstructV8(initial:SimulationStateV8Family,operations:TraceOperationV8[],expected:SimulationStateV8Family){
    let state=cloneSimulationV8(initial);
    for(const op of operations){
        const transition=op.kind==='ticks'?advanceSimulationTicksV8(state,1):op.kind==='intent'
            ?applySimulationIntentV8(state,op.actor,op.intent,op.turn,op.phase,op.epoch):applySimulationBarrierV8(state,op.barrier);
        assert.ok(transition.accepted&&transition.mutated);state=transition.state;
    }
    assert.equal(hashSimulationStateV8(state),hashSimulationStateV8(expected));
}
function castAvailableV8(source:SimulationStateV8Family){
    for(let ordinal=0;ordinal<30;ordinal++){
        let state=cloneSimulationV8(source);const controller=new LoomkeeperExecutionV8(candidateAt(ordinal),state);const ops:TraceOperationV8[]=[];
        state=drainV8(state,controller,ops);
        for(let tick=0;tick<15&&state.phase==='action';tick++){state=advanceSimulationTicksV8(state,1).state;state=drainV8(state,controller,ops);}
        if(state.phase==='projectile')return true;
    }
    return false;
}

function runV7(scenario:Scenario){
    const initial=fixtureV7(scenario);let state=cloneSimulation(initial);const operations:TraceOperationV7[]=[];
    let handovers=0;const openingStart=state.units.map(unit=>unit.stitching);let openingEnd:number[]|undefined,replyState:SimulationState|undefined;
    while(state.phase!=='finished'){
        const actor=state.activeActor;const commands=actor==='loomkeeper'?decideLoomkeeperTurn(state,'standard')?.commands:scriptedV7(state,scenario.scriptIndex);
        if(!commands?.length){const count=state.turnDeadlineTick-state.tick;state=advanceSimulationTicks(state,count).state;operations.push({kind:'ticks',count});}
        for(const command of commands??[]){
            const transition=applySimulationCommand(state,actor,command,state.turn);if(!transition.accepted)throw new Error('Illegal V7 assessment command.');
            state=transition.state;operations.push({kind:'command',actor,command});if(state.phase==='finished'||state.activeActor!==actor)break;
        }
        if(state.phase!=='finished'&&state.activeActor===actor){
            const count=state.turnDeadlineTick-state.tick;assert.ok(count>0);
            state=advanceSimulationTicks(state,count).state;operations.push({kind:'ticks',count});
        }
        if(state.activeActor!==actor){handovers+=1;if(!openingEnd){openingEnd=state.units.map(unit=>unit.stitching);replyState=cloneSimulation(state);}}
    }
    if(!openingEnd)openingEnd=state.units.map(unit=>unit.stitching);
    reconstructV7(initial,operations,state);
    const replyAvailable=Boolean(replyState?.phase==='awaiting_command'&&replyState.units[scenario.firstActor==='player'?1:0].alive);
    return {...scenario,terminal:true,winner:state.winner,terminalReason:state.finishReason,finalTurn:state.turn,completedTurns:handovers,
        openingDamage:{player:openingStart[0]-openingEnd[0],loomkeeper:openingStart[1]-openingEnd[1]},replyAvailable,
        castAvailable:replyAvailable?castAvailableV7(replyState!):false,aiOutcome:state.winner==='loomkeeper'?'win':state.winner==='draw'?'draw':'loss',
        firstActorOutcome:state.winner===scenario.firstActor?'win':state.winner==='draw'?'draw':'loss',
        logicalTicks:state.tick,finalStateHash:hashV7(state),replayOperations:operations.length,replay:{initialState:initial,operations}};
}
function scriptedV7(source:SimulationState,scriptIndex:0|1|4):SimulationCommand[]|undefined{
    let moved=cloneSimulation(source);const prefix:SimulationCommand[]=[];
    const ownIndex=source.activeActor==='player'?0:1,targetIndex=1-ownIndex;
    const direction=(Math.sign(source.units[targetIndex].x-source.units[ownIndex].x)||source.units[ownIndex].facing) as -1|1;
    if(scriptIndex!==0)for(let step=0;step<8;step++){
        const command:SimulationCommand={type:'move',direction};
        const transition=applySimulationCommand(moved,source.activeActor,command,source.turn);
        if(!transition.accepted)break;moved=transition.state;prefix.push(command);
    }
    const facing=(Math.sign(moved.units[targetIndex].x-moved.units[ownIndex].x)||moved.units[ownIndex].facing) as -1|1;
    if(moved.units[ownIndex].facing!==facing){
        const command:SimulationCommand={type:'move',direction:0};
        const transition=applySimulationCommand(moved,source.activeActor,command,source.turn);
        assert.ok(transition.accepted);moved=transition.state;prefix.push(command);
    }
    let best:{commands:SimulationCommand[];rank:number[]}|undefined;
    for(let ordinal=0;ordinal<30;ordinal++){
        const candidate=candidateAt(scriptIndex*30+ordinal);let state=cloneSimulation(moved);const commands:SimulationCommand[]=[];
        const error=aimError(state,candidate.angleMilliDegrees,candidate.powerPermille);
        commands.push({type:'select_relic',relicId:candidate.relicId},{type:'aim',...error},{type:'fire'});
        let valid=true;for(const command of commands){const transition=applySimulationCommand(state,source.activeActor,command,source.turn);if(!transition.accepted){valid=false;break;}state=transition.state;}
        if(!valid)continue;
        const beforeOwn=source.units[source.activeActor==='player'?0:1],beforeTarget=source.units[source.activeActor==='player'?1:0];
        const afterOwn=state.units[source.activeActor==='player'?0:1],afterTarget=state.units[source.activeActor==='player'?1:0];
        const outcome=state.winner===source.activeActor?3:state.winner==='draw'?1:state.winner?0:2;
        const rank=[outcome,(beforeTarget.stitching-afterTarget.stitching)-2*(beforeOwn.stitching-afterOwn.stitching),
            Math.min(640*256,Math.abs(state.units[0].x-state.units[1].x)*256),-candidate.movementTicks,-candidate.ordinal];
        if(!best||compare(rank,best.rank)>0)best={commands:[...prefix,...commands],rank};
    }
    return best?.commands??prefix;
}
function castAvailableV7(source:SimulationState){return Boolean(scriptedV7(source,0)?.some(command=>command.type==='fire'));}
function reconstructV7(initial:SimulationState,operations:TraceOperationV7[],expected:SimulationState){
    let state=cloneSimulation(initial);for(const op of operations){const transition=op.kind==='ticks'?advanceSimulationTicks(state,op.count)
        :applySimulationCommand(state,op.actor,op.command,state.turn);assert.ok(transition.accepted);state=transition.state;}
    assert.equal(hashV7(state),hashV7(expected));
}

function fixtureV8(s:Scenario){let state:SimulationStateV8Family=createSimulationV8(s.seed,'wizard',V8_R1_RULESET_ID);if(s.reflected)state=reflectV8(state);
    state.activeActor=s.firstActor;assertSimulationInvariantsV8Family(state);return state;}
function reflectV8(source:SimulationStateV8Family){const state=cloneSimulationV8(source);state.terrain=reflectTerrain(state.terrain);
    for(const unit of state.units){unit.xFp=2048*256-unit.xFp;unit.facing=-unit.facing as -1|1;unit.support=supportAt(state,unit);}
    assertSimulationInvariantsV8Family(state);return state;}
function supportAt(state:SimulationStateV8Family,unit:SimulationStateV8Family['units'][number]){
    const bottom=unit.yFp+12*256;if(bottom%(8*256)!==0)return null;const cy=bottom/(8*256);
    const first=Math.max(0,Math.floor((unit.xFp-12*256)/(8*256)));const last=Math.min(255,Math.ceil((unit.xFp+12*256)/(8*256))-1);
    for(let x=first;x<=last;x++)if(terrainSolid(state.terrain,x,cy))return cy*256+x;return null;
}
function fixtureV7(s:Scenario){let state=createSimulation(s.seed,'wizard',V7_RULESET_ID);if(s.reflected){state=cloneSimulation(state);state.terrain=reflectTerrain(state.terrain);
    for(const unit of state.units){unit.x=2048-unit.x;unit.facing=-unit.facing as -1|1;}}
    state.activeActor=s.firstActor;assertSimulationInvariants(state);return state;}
function reflectTerrain<T extends {width:number;height:number;cellSize:number;words:number[]}>(source:T):T{const result={...source,words:new Array(source.words.length).fill(0)};
    for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(terrainSolid(source,x,y))setTerrainSolid(result,source.width-1-x,y,true);return result;}
function aimError(state:{seed:number;turn:number},angle:number,power:number){return{angleMilliDegrees:Math.max(-90000,Math.min(90000,angle+((state.seed+97*state.turn)%5001)-2500)),
    powerPermille:Math.max(0,Math.min(1000,power+((state.seed+53*state.turn)%101)-50))};}
function compare(a:number[],b:number[]){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;}
function hashV7(state:SimulationState){return createHash('sha256').update(canonicalSimulationJson(state)).digest('hex');}
function runCorrectness(source:SimulationStateV8Family){
    const planner=new LoomkeeperPlannerV8(source);for(let tick=0;tick<30;tick++)planner.step();
    let state=advanceSimulationTicksV8(source,30).state;const selected=planner.selectedCandidate();
    const controller=selected?new LoomkeeperExecutionV8(selected,state):undefined,executionHashes:string[]=[];
    while(state.phase!=='finished'&&state.turn===source.turn){
        if(controller)for(let count=0;count<8;count++){
            const operation=controller.next(state);if(!operation)break;
            const transition=operation.kind==='intent'?applySimulationIntentV8(state,state.activeActor,operation.intent,state.turn,state.phase,state.inputEpoch)
                :applySimulationBarrierV8(state,operation.barrier);
            assert.ok(transition.accepted);state=transition.state;executionHashes.push(hashSimulationStateV8(state));
        }
        if(state.phase==='finished'||state.turn!==source.turn)break;
        state=advanceSimulationTicksV8(state,1).state;executionHashes.push(hashSimulationStateV8(state));
    }
    return{selection:planner.selection,executionHashes};
}
function outcomes<T extends {winner:any;firstActor:SimulationActor}>(rows:T[]){return{firstActorWins:rows.filter(r=>r.winner===r.firstActor).length,
    firstActorLosses:rows.filter(r=>r.winner!=='draw'&&r.winner!==r.firstActor).length,draws:rows.filter(r=>r.winner==='draw').length,
    aiWins:rows.filter(r=>r.winner==='loomkeeper').length,aiLosses:rows.filter(r=>r.winner==='player').length,
    aiDraws:rows.filter(r=>r.winner==='draw').length};}
