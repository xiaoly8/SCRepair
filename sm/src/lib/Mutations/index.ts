/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */

import util from 'util';
import { DeepReadonly } from "ts-essentials";
import { ASTNode } from "solidity-parser-antlr";

import FaultSpace from '../FaultSpace';

export { default as Mutation } from './Mutation';

import InsertionM from './InsertionM';
export { default as InsertionM } from './InsertionM';

import DeletionM from './DeletionM';
export { default as DeletionM } from './DeletionM';

import MovementM from './MovementM';
export { default as MovementM } from './MovementM';

import { ReplacementM } from './ReplacementM';
export { ReplacementM as ReplacementM } from './ReplacementM';

export { default as RandomMutationGenerator } from './RandomMutationGenerator';

// export type MutationSequence = Mutation[];

export interface FaultSpaceUpdate_base {
  readonly updateType: string;
}
export interface FaultSpaceUpdate_base_with_faultSpace extends FaultSpaceUpdate_base {
  readonly faultSpaces: readonly DeepReadonly<FaultSpace>[];
}
export interface FaultSpaceUpdate_base_with_faultSpace_Node extends FaultSpaceUpdate_base {
  readonly faultSpace_Nodes: readonly [DeepReadonly<FaultSpace>, DeepReadonly<ASTNode>][];
}
export type FaultSpaceUpdate_base_with_faultSpace_info = FaultSpaceUpdate_base_with_faultSpace | FaultSpaceUpdate_base_with_faultSpace_Node;
export interface FaultSpaceUpdate_add extends FaultSpaceUpdate_base_with_faultSpace {
  readonly updateType: 'add';
}
export interface FaultSpaceUpdate_remove extends FaultSpaceUpdate_base_with_faultSpace {
  readonly updateType: 'remove';
}
export interface FaultSpaceUpdate_intersect extends FaultSpaceUpdate_base_with_faultSpace {
  readonly updateType: 'intersect';
}
export interface FaultSpaceUpdate_updateWeigh extends FaultSpaceUpdate_base_with_faultSpace {
  readonly updateType: 'updateWeigh';
}

export type FaultSpaceUpdate = FaultSpaceUpdate_add | FaultSpaceUpdate_remove | FaultSpaceUpdate_intersect | FaultSpaceUpdate_updateWeigh;

export const allMutationTypes: readonly string[] = [
  InsertionM.name,
  ReplacementM.name,
  DeletionM.name,
  MovementM.name,
] as const;

export function objToMutation(obj: any) {
  if (
    typeof obj.mutationType !== 'undefined' &&
    [InsertionM.name, ReplacementM.name, DeletionM.name, MovementM.name].includes(
      obj.mutationType,
    )
  ) {
    switch (obj.mutationType) {
      case InsertionM.name: {
        return new InsertionM(obj.targetPropertyPath, obj.insertIndex, obj.newNode);
      }
      case ReplacementM.name: {
        return new ReplacementM(obj.targetNodePath, obj.newNode);
      }
      case DeletionM.name: {
        return new DeletionM(obj.targetNodePath);
      }
      case MovementM.name: {
        return new MovementM(obj.ast, obj.fromNodePath, obj.toPropertyPath, obj.insertIndex);
      }
      default: {
        throw new Error('Regression logic error');
      }
    }
  } else {
    throw new Error(`The following object is not a mutation object:\n${util.inspect(obj, true, Infinity, true)}`);
  }
}

