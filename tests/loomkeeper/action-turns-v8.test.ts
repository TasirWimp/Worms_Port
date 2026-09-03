import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceSimulationTicksV8, applySimulationBarrierV8, applySimulationIntentV8, assertSimulationInvariantsV8Family,
    cloneSimulationV8, createSimulationV8, V8_R1_RULESET_ID, type SimulationStateV8Family } from '../../shared/simulation-v8';
import { setTerrainSolid, terrainSolid, type PlayerCalling } from '../../shared/simulation';
import { hashSimulationStateV8, SimulationCoordinatorV8 } from '../../server/src/simulation/coordinator-v8';
import { candidateAt, LoomkeeperExecutionV8, LoomkeeperPlannerV8 } from '../../shared/loomkeeper-v8';

test('automated V8 has a distinct envelope without changing original constructors', () => {
    const coordinator = new SimulationCoordinatorV8({ nowUs: () => 0 });
    try {
        assert.equal((coordinator.create('foundation_challenge', 'session_identity_1', 1, 'wizard', V8_R1_RULESET_ID) as any).automationId, undefined);
        const automated = (coordinator as any).createAutomated('automated_challenge', 'session_identity_1', 1, 'wizard');
        assert.equal(automated.automationId, 'wp-015d3a-v8d-r1-v1');
        assert.equal(automated.state.rulesetId, V8_R1_RULESET_ID);
        assert.deepEqual((coordinator.replay('automated_challenge') as any).chosenPlans, []);
    } finally { coordinator.dispose(); }
});

test('V8 planning evaluates exactly six slots per charged planning tick and never mutates its source', () => {
    const source = advanceSimulationTicksV8(createSimulationV8(1, 'wizard', V8_R1_RULESET_ID), 450).state;
    const before = JSON.stringify(source);
    const planner = new LoomkeeperPlannerV8(source);
    for (let tick = 1; tick <= 30; tick++) {
        planner.step();
        assert.equal(planner.evaluatedCandidates, tick * 6);
        assert.equal(planner.planningTicks, tick);
        assert.ok(planner.rolloutTicks <= tick * 6 * 1050);
        assert.equal(JSON.stringify(source), before);
    }
    assert.equal(planner.selection.status, 'selected');
    assert.ok(planner.selection.ordinal! >= 0 && planner.selection.ordinal! < 180);
    assert.throws(() => planner.step());
});

test('the frozen 180-plan enumeration order and bounds are exact',()=>{
    assert.deepEqual(candidateAt(0),{ordinal:0,scriptIndex:0,movementTicks:0,jump:false,direction:'stay',relicId:'threadball',angleMilliDegrees:15000,powerPermille:700});
    assert.deepEqual(candidateAt(179),{ordinal:179,scriptIndex:5,movementTicks:90,jump:true,direction:'away',relicId:'spoolburst',angleMilliDegrees:75000,powerPermille:1000});
    assert.throws(()=>candidateAt(180));
});

test('the exact rollout cap rejects an unfinished own turn but admits boundary completion',async()=>{
    const {assertLoomkeeperRolloutBoundsV8}=await import('../../shared/loomkeeper-v8');
    const initial=aiFixture(1,'wizard',false),handedOver=advanceSimulationTicksV8(initial,450).state;
    assert.doesNotThrow(()=>assertLoomkeeperRolloutBoundsV8(handedOver,initial.turn,1050,512));
    assert.throws(()=>assertLoomkeeperRolloutBoundsV8(initial,initial.turn,1050,1));
    assert.throws(()=>assertLoomkeeperRolloutBoundsV8(handedOver,initial.turn,1051,1));
    assert.throws(()=>assertLoomkeeperRolloutBoundsV8(handedOver,initial.turn,1050,513));
});

test('the six feature fixtures repeat plan and executed hashes',t=>{
    const seeds=[1,2,3];
    const callings:PlayerCalling[]=['wizard'];let cases=0;
    for(const seed of seeds)for(const reflected of [false,true])for(const calling of callings){
        const source=aiFixture(seed,calling,reflected);const selections=[];const executions=[];
        for(let repetition=0;repetition<2;repetition++){
            const planner=new LoomkeeperPlannerV8(source);for(let tick=0;tick<30;tick++)planner.step();
            selections.push(planner.selection);executions.push(executeDetached(advanceSimulationTicksV8(source,30).state,
                planner.selectedCandidate()&&new LoomkeeperExecutionV8(planner.selectedCandidate()!,advanceSimulationTicksV8(source,30).state)));
        }
        assert.deepEqual(selections[0],selections[1]);assert.deepEqual(executions[0],executions[1]);cases+=1;
    }
    assert.equal(cases,6);t.diagnostic('6 deterministic feature cases repeated twice; full60 belongs to assess:v8');
});

test('one complete planning pass retains a host-specific CPU observation',t=>{
    const planner=new LoomkeeperPlannerV8(aiFixture(1,'wizard',false));
    const batches:number[]=[];for(let tick=0;tick<30;tick++){const start=performance.now();planner.step();batches.push(performance.now()-start);}
    const total=batches.reduce((sum,value)=>sum+value,0),maximum=Math.max(...batches);
    t.diagnostic(`bounded planning CPU observation total=${total.toFixed(3)}ms max-six-plan-batch=${maximum.toFixed(3)}ms`);
    assert.equal(planner.evaluatedCandidates,180);
    t.diagnostic('Observation only: this CPU sample is not live scheduler or deployment admission proof.');
});

test('one bounded real-clock AI planning pass survives the unchanged scheduler cadence',async t=>{
    let epoch:number|undefined;const batches:number[]=[];let maxDebt=0;
    const coordinator=new SimulationCoordinatorV8({nowUs:()=>epoch===undefined?0:Math.floor((performance.now()-epoch)*1000),
        plannerFactory:state=>{const planner=new LoomkeeperPlannerV8(state),step=planner.step.bind(planner);
            planner.step=()=>{const start=performance.now();try{return step();}finally{batches.push(performance.now()-start);}};
            return planner;}});
    try{
        const id='bounded_cadence_fixture';coordinator.createAutomated(id,'session_identity_1',1,'wizard');
        coordinator.advance(id,450);epoch=performance.now();
        while(coordinator.get(id)!.state.tick<480&&!coordinator.get(id)!.unavailable){
            await new Promise(resolve=>setTimeout(resolve,10));
            const elapsedTicks=Math.floor((performance.now()-epoch)*30/1000);
            maxDebt=Math.max(maxDebt,elapsedTicks-(coordinator.get(id)!.state.tick-450));await coordinator.catchUp(id);
            assert.ok(performance.now()-epoch<5000,'Bounded cadence fixture exceeded its five-second observation window.');
        }
        assert.equal(coordinator.get(id)!.unavailable,false);assert.equal(batches.length,30);
        assert.equal((coordinator.replay(id) as any).chosenPlans.length,1);
        t.diagnostic(`host-only scheduler sample elapsed=${(performance.now()-epoch).toFixed(3)}ms max-debt=${maxDebt} ticks max-six-plan-batch=${Math.max(...batches).toFixed(3)}ms; no deployment/concurrency claim`);
    }finally{coordinator.dispose();}
});

test('automatic execution charges planning, retains one choice, and reconstructs exact AI operation timing', () => {
    const coordinator = new SimulationCoordinatorV8({ nowUs: () => 0 });
    try {
        const id='timing_challenge_1';
        (coordinator as any).createAutomated(id, 'session_identity_1', 1, 'wizard');
        coordinator.advance(id, 450 + 29);
        assert.equal(coordinator.get(id)!.state.acceptedIntentCount, 0);
        assert.deepEqual((coordinator.replay(id) as any).chosenPlans, []);
        coordinator.advance(id, 1);
        assert.equal((coordinator.replay(id) as any).chosenPlans.length, 1);
        assert.ok(coordinator.get(id)!.state.acceptedIntentCount > 0);
        while (coordinator.get(id)!.state.turn === 1) coordinator.advance(id, 1);
        const replay = coordinator.replay(id)!;
        assert.equal(coordinator.reconstructAndVerify(replay).stateHash, coordinator.get(id)!.stateHash);
        const forged: any = structuredClone(replay);
        forged.chosenPlans[0].ordinal = (forged.chosenPlans[0].ordinal + 1) % 180;
        assert.throws(() => coordinator.reconstructAndVerify(forged));
    } finally { coordinator.dispose(); }
});

test('bounded planning work failure stays neutral and can never prove an automated replay',()=>{
    const coordinator=new SimulationCoordinatorV8({nowUs:()=>0,plannerFactory:()=>{throw new Error('injected planning failure');}});
    try{
        const id='work_failure_challenge';coordinator.createAutomated(id,'session_identity_1',1,'wizard');
        coordinator.advance(id,480);const replay:any=coordinator.replay(id)!;
        assert.deepEqual(replay.chosenPlans,[{turn:1,status:'work_failure',ordinal:null}]);
        assert.equal(coordinator.get(id)!.state.acceptedIntentCount,0);
        assert.throws(()=>coordinator.reconstructAndVerify(replay));
        coordinator.advance(id,420);assert.equal(coordinator.get(id)!.state.turn,2);
    }finally{coordinator.dispose();}
});

test('each later AI turn starts a fresh charged planning pass without a stale selection',()=>{
    const coordinator=new SimulationCoordinatorV8({nowUs:()=>0});
    try{
        const id='second_ai_turn_fixture';coordinator.createAutomated(id,'session_identity_1',1,'wizard');
        coordinator.advance(id,480);
        while(coordinator.get(id)!.state.turn===1)coordinator.advance(id,1);
        coordinator.advance(id,450);
        assert.equal(coordinator.get(id)!.state.turn,3);
        assert.equal(coordinator.get(id)!.state.acceptedIntentCount,0);
        assert.equal((coordinator.replay(id) as any).chosenPlans.length,1);
        coordinator.advance(id,29);
        assert.equal(coordinator.get(id)!.state.acceptedIntentCount,0);
        assert.equal((coordinator.replay(id) as any).chosenPlans.length,1);
        coordinator.advance(id,1);
        assert.equal((coordinator.replay(id) as any).chosenPlans.length,2);
        assert.equal((coordinator.replay(id) as any).chosenPlans[1].turn,3);
        assert.equal(coordinator.reconstructAndVerify(coordinator.replay(id)!).stateHash,coordinator.get(id)!.stateHash);
    }finally{coordinator.dispose();}
});

function aiFixture(seed:number,calling:PlayerCalling,reflected:boolean):SimulationStateV8Family{
    const state=createSimulationV8(seed,calling,V8_R1_RULESET_ID);state.activeActor='loomkeeper';
    if(reflected){const terrain={...state.terrain,words:new Array(state.terrain.words.length).fill(0)};
        for(let y=0;y<state.terrain.height;y++)for(let x=0;x<state.terrain.width;x++)if(terrainSolid(state.terrain,x,y))setTerrainSolid(terrain,255-x,y,true);
        state.terrain=terrain;for(const unit of state.units){unit.xFp=2048*256-unit.xFp;unit.facing=-unit.facing as -1|1;
            const bottom=unit.yFp+12*256,cy=bottom/(8*256);unit.support=null;
            for(let x=Math.floor((unit.xFp-12*256)/(8*256));x<=Math.ceil((unit.xFp+12*256)/(8*256))-1;x++)
                if(terrainSolid(terrain,x,cy)){unit.support=cy*256+x;break;}}
    }
    assertSimulationInvariantsV8Family(state);return state;
}
function executeDetached(source:SimulationStateV8Family,controller:any){
    let state=cloneSimulationV8(source);const hashes:string[]=[];if(!controller)return hashes;
    while(state.phase!=='finished'&&state.turn===source.turn){
        for(let count=0;count<8;count++){const operation=controller.next(state);if(!operation)break;
            const transition=operation.kind==='intent'?applySimulationIntentV8(state,state.activeActor,operation.intent,state.turn,state.phase,state.inputEpoch)
                :applySimulationBarrierV8(state,operation.barrier);assert.ok(transition.accepted);state=transition.state;hashes.push(hashSimulationStateV8(state));}
        if(state.phase==='finished'||state.turn!==source.turn)break;state=advanceSimulationTicksV8(state,1).state;hashes.push(hashSimulationStateV8(state));
    }
    return hashes;
}
