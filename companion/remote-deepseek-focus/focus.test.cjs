const test = require('node:test');
const assert = require('node:assert/strict');
const { createController } = require('./focus.cjs');
function host({web=true,remote=true,enabled=true,missing=false,fail=false}={}) {
  const state = {sidebar:true,auxiliary:true,panel:true,groups:2,deepseek:false,activated:false};
  const ids=['deepseekHarness.openChatWindow','workbench.action.joinAllGroups','workbench.action.closeSidebar','workbench.action.closeAuxiliaryBar','workbench.action.closePanel','workbench.action.focusActiveEditorGroup','workbench.view.explorer'];
  const api={env:{uiKind:web?2:1,remoteName:remote?'tunnel':undefined},UIKind:{Web:2},
    workspace:{getConfiguration:()=>({get:()=>enabled})},
    extensions:{getExtension:()=>missing?undefined:{activate:async()=>{state.activated=true}}},
    commands:{getCommands:async()=>ids,executeCommand:async id=>{
      if(id==='deepseekHarness.openChatWindow'){if(fail)throw Error('cannot open');state.deepseek=true;}
      if(id==='workbench.action.joinAllGroups')state.groups=1;
      if(id==='workbench.action.closeSidebar')state.sidebar=false;
      if(id==='workbench.action.closeAuxiliaryBar')state.auxiliary=false;
      if(id==='workbench.action.closePanel')state.panel=false;
      if(id==='workbench.view.explorer')state.sidebar=true;
    }}};
  return {state,api};
}
test('desktop, local web and disabled sessions retain their layout',async()=>{
  for(const options of [{web:false},{remote:false},{enabled:false}]){
    const {state,api}=host(options);const before={...state};
    await createController(api).apply();assert.deepEqual(state,before);
  }
});
test('missing or failing DeepSeek preserves access to existing views',async()=>{
  for(const options of [{missing:true},{fail:true}]){
    const {state,api}=host(options);await assert.rejects(()=>createController(api).apply());
    assert.equal(state.sidebar,true);assert.equal(state.auxiliary,true);assert.equal(state.panel,true);assert.equal(state.groups,2);
  }
});
test('web remote gets one wide editor and repeated application does not toggle bars back',async()=>{
  const {state,api}=host();const c=createController(api);
  await c.apply();await c.apply();
  assert.equal(state.deepseek,true);assert.equal(state.groups,1);
  assert.equal(state.sidebar,false);assert.equal(state.auxiliary,false);assert.equal(state.panel,false);
  await c.restore();assert.equal(state.sidebar,true);assert.equal(state.deepseek,true);
});
