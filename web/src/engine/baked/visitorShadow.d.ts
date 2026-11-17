import type { Material, PointLight, Vector3 } from 'three';
export interface VisitorShadowState {
  position: Vector3;
  uniforms: Record<string,{value:Vector3|number}>;
  metadata: { method:string;blockerSamples:number;filterSamples:number;maximumDepthFetches:number;sourceRadiusMetres:number;minimumBlocker:string;screenFootprint:string;otherLights:string;temporalRandomness:boolean;extraRenderTargets:number;cpuGpuReadback:boolean };
  setSourceRadius(radius:number):void;
  copyLightPosition(light:PointLight):void;
  install<T extends Material>(material:T):T;
}
export function createVisitorShadow(options:{lightWorld:Vector3;sourceRadius:number;matchTolerance?:number}):VisitorShadowState;
