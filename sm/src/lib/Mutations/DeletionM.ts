/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */

import { Mutation, FaultSpaceUpdate } from ".";
import RandomMutationGenerator from './RandomMutationGenerator';
import { DeepReadonly, DeepWritable } from "ts-essentials";
import { NodePath, getASTNodeFromPath, arrStartsWithArr, deletableFaultSpace } from "../utils";
import { ASTNode, ASTNodeTypeString } from "solidity-parser-antlr";
import assert from "assert";
import MutationSequence, { rebasePath } from "../MutationSequence";
import FaultSpace from "../FaultSpace";
import {
    cloneDeep as lodash_cloneDeep,
    has as lodash_has,
    unset as lodash_unset,
    range as lodash_range,
    isEqual as lodash_equal,
    unionWith as lodash_unionWith,
    pullAllWith as lodash_pullAllWith,
    intersectionWith as lodash_intersectionWith,
} from 'lodash';
import treeify from 'treeify';
import debug from 'debug';

const debugLogger_space = debug('space');
const debugLogger_deletableSpace = debugLogger_space.extend('DeletableSpace');


/*
    Mutation that deletes a node from a list of children
*/
export default class DeletionM extends Mutation {
    public readonly mutationType: string = DeletionM.name;
  
    constructor(public readonly targetNodePath: DeepReadonly<NodePath>) {
      super(targetNodePath);
    }
  
    public apply(ast: ASTNode): void {
      const targetNodeParentAttribute = getASTNodeFromPath(ast, this.targetNodePath.slice(0, -1));
      if (Array.isArray(targetNodeParentAttribute)) {
        const idxStr = parseInt(this.targetNodePath[this.targetNodePath.length - 1]);
        assert(Number.isInteger(idxStr));
  
        targetNodeParentAttribute.splice(idxStr, 1);
      } else {
        assert(lodash_has(ast, this.targetNodePath));
        assert(lodash_unset(ast, this.targetNodePath));
      }
    }
  
    public updateASTPath(ast: DeepReadonly<ASTNode>, path: DeepReadonly<NodePath>): NodePath | null {
      if (arrStartsWithArr(path, this.targetNodePath)) {
        return null;
      }
  
      const deletedNodeParent = getASTNodeFromPath(ast, this.targetNodePath.slice(0, -1));
      if (Array.isArray(deletedNodeParent)) {
        if (
          this.targetNodePath.slice(0, -1).every((x, idx) => x === path[idx]) &&
          path.length >= this.targetNodePath.length
        ) {
          const deletedNodePreIdx = parseInt(this.targetNodePath[this.targetNodePath.length - 1]);
          const target = path[this.targetNodePath.length - 1];
          assert(typeof target === 'string');
  
          const targetNum = parseInt(target);
          if (targetNum > deletedNodePreIdx) {
            const newPath = lodash_cloneDeep(path) as DeepWritable<typeof path>;
            newPath[this.targetNodePath.length - 1] = (targetNum - 1).toString() as any;
            return newPath;
          }
        }
      }
      return path as DeepWritable<typeof path>;
    }
  
    public reverseUpdateASTPath(ast: DeepReadonly<ASTNode>, path: DeepReadonly<NodePath>): NodePath | null {
      const deletedNodeParent = getASTNodeFromPath(ast, this.targetNodePath.slice(0, -1));
      if (Array.isArray(deletedNodeParent)) {
        if (
          this.targetNodePath.slice(0, -1).every((x, idx) => x === path[idx]) &&
          path.length >= this.targetNodePath.length
        ) {
          const deletedNodePreIdx = parseInt(this.targetNodePath[this.targetNodePath.length - 1]);
          const target = path[this.targetNodePath.length - 1];
          assert(typeof target === 'string');
  
          const targetNum = parseInt(target);
          if (targetNum + 1 > deletedNodePreIdx) {
            const newPath = lodash_cloneDeep(path) as DeepWritable<typeof path>;
            newPath[this.targetNodePath.length - 1] = (targetNum + 1).toString() as any;
            return newPath;
          }
        }
      }
      return path as DeepWritable<typeof path>;
    }
  
    public rebase(
      oriAST: DeepReadonly<ASTNode>,
      fromMutationSequence: MutationSequence,
      beforeMutationASTs: DeepReadonly<ASTNode[]>,
      afterMutationSequence: MutationSequence,
      afterMutationASTs: DeepReadonly<ASTNode[]>,
    ): DeletionM | undefined {
      const newTargetNodePath = rebasePath(
        this.targetNodePath,
        oriAST,
        fromMutationSequence,
        beforeMutationASTs,
        afterMutationSequence,
        afterMutationASTs,
      );
      return newTargetNodePath !== undefined ? new DeletionM(newTargetNodePath) : undefined;
    }
  
    public static randomGenerator(
      ast: DeepReadonly<ASTNode>,
      faultSpace: DeepReadonly<FaultSpace[]>,
      rng: Chance.Chance
    ): RandomMutationGenerator_DeletionM {
      return new RandomMutationGenerator_DeletionM(ast, faultSpace, rng);
    }

    public modifiedNodePath(_ast: DeepReadonly<ASTNode>): DeepReadonly<NodePath[]> {
      return [];
    }
  }

  class RandomMutationGenerator_DeletionM extends RandomMutationGenerator<DeletionM> {

    public readonly deletableNodeTypes: ASTNodeTypeString[] = ['ExpressionStatement'];
    
    private deletableSpace: FaultSpace[] = [];
  
    public constructor(private readonly forAST: DeepReadonly<ASTNode>,
      faultSpace: DeepReadonly<FaultSpace[]>,
      private rng: Chance.Chance) {
  
      super();
  
      assert(this.updateFaultSpace({
        updateType: 'add',
        faultSpaces: faultSpace
      }));

    }
  
    public next(): IteratorResult<DeletionM | undefined> {
  
      // Note: Use Set to hopefully have performance boost
      // const disallowedNodeTypes = new Set([
      //   'range',
      //   'loc',
      //   'parameters',
      //   'arguments',
      //   'names',
      //   'modifiers',
      //   'variables',
      //   'components',
      //   'members'
      // ]);
  
      if (this.deletableSpace.length === 0) {
        return { done: true, value: undefined };
      }
  
      debugLogger_deletableSpace(treeify.asTree(this.deletableSpace as any, true, true));
  
      const chosenFaultSpace_idx = this.rng.weighted(lodash_range(0, this.deletableSpace.length), this.deletableSpace.map((_x) => 1));
      // can be done with a `this.updateFaultSpace` call
      const chosenFaultSpace = this.deletableSpace.splice(chosenFaultSpace_idx, 1)[0];
  
      assert(chosenFaultSpace !== undefined);
      return { done: false, value: new DeletionM(chosenFaultSpace.nodePath) };
  
    }
  
    public updateFaultSpace(faultSpaceUpdateObj: FaultSpaceUpdate): boolean {
      switch(faultSpaceUpdateObj.updateType) {
        case 'add': {
          const newDeleteableSpace = deletableFaultSpace(this.forAST, faultSpaceUpdateObj.faultSpaces, this.deletableNodeTypes);
          this.deletableSpace = lodash_unionWith(this.deletableSpace, newDeleteableSpace, (a, b)=> lodash_equal(a.nodePath, b.nodePath) );
          return true;
        }
        case 'remove': {
          lodash_pullAllWith(this.deletableSpace, faultSpaceUpdateObj.faultSpaces, (a, b)=> lodash_equal(a.nodePath, b.nodePath) );
          return true;
        }
        case 'intersect': {
          // Done
          lodash_intersectionWith(this.deletableSpace, faultSpaceUpdateObj.faultSpaces, (a, b)=> lodash_equal(a.nodePath, b.nodePath) );
          return true;
        }
        default: {
          throw new UnimplementedError();
        }
      }
    }

    public isMutationInRemainingSpace(mutation: DeletionM): boolean {
      return this.deletableSpace.find((space)=>lodash_equal(space.nodePath, mutation.targetNodePath)) !== undefined;
    }

    public numMutationRemaining(): number {
      throw new UnimplementedError();
  }
  
  }