import type { WorkflowRunsController } from './controller.js'
export class DashboardWorkflowRunsAdapter {constructor(readonly controller:WorkflowRunsController){}open=false;sessionId?:string;show(sessionId:string){this.sessionId=sessionId;this.open=true;void this.controller.refresh(sessionId)}close(){this.open=false}dispose(){this.close()}}
