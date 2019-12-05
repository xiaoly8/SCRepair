/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import {
  cloneDeep as lodash_cloneDeep,
  uniqWith as lodash_uniqWith,
  isEqual as lodash_equal,
  flatten as lodash_flatten
} from 'lodash';
import { ASTNode, CodeRange } from 'solidity-parser-antlr';
import { DeepReadonly } from 'ts-essentials';
import { Mutation } from './Mutations';
import { NodePath, NodePath_Stringified } from './utils';

export function rebasePath(
  path: DeepReadonly<NodePath>,
  oriAST: DeepReadonly<ASTNode>,
  fromMutationSequence: MutationSequence,
  beforeMutationASTs: DeepReadonly<ASTNode[]>,
  afterMutationSequence: MutationSequence,
  afterMutationASTs: DeepReadonly<ASTNode[]>,
): NodePath | undefined {
  const path_oriAST = fromMutationSequence.reverseUpdatePath(beforeMutationASTs, [path] as const)[0];
  if (path_oriAST === null) {
    return undefined;
  }

  const newpath = afterMutationSequence.updatePath([oriAST, ...afterMutationASTs], [
    path_oriAST,
  ])[0];

  if (newpath === null) {
    return undefined;
  }

  return newpath;
}

export default class MutationSequence<T extends Mutation = Mutation> extends Array<T> {

  public reverseUpdatePath_oriAST(
    oriAST: DeepReadonly<ASTNode>,
    paths: DeepReadonly<NodePath[]>,
  ): Array<NodePath | null> {
    const prevASTs = this.slice(0, -1).reduce(
      (asts, mutation, idx) => {
        const newAST = lodash_cloneDeep(asts[idx]) as ASTNode;
        mutation.apply(newAST);
        asts.push(newAST);

        return asts;
      },
      [oriAST],
    );

    return this.reverseUpdatePath(prevASTs, paths);
  }

  public reverseUpdatePath(
    prevASTs: DeepReadonly<ASTNode[]>,
    paths: DeepReadonly<NodePath[]>,
  ): Array<NodePath | null> {
    const rstPaths: Array<NodePath | null> = [];

    for (const path of paths) {
      rstPaths.push(
        this.reduceRight(
          (currPath: NodePath | null, mutation, idx) => {
            return currPath !== null ? mutation.reverseUpdateASTPath(prevASTs[idx], currPath) : currPath;
          },
          path as NodePath,
        ),
      );
    }

    return rstPaths;
  }

  public updatePath_oriAST(
    oriAST: DeepReadonly<ASTNode>,
    paths: DeepReadonly<NodePath[]>,
  ): Array<NodePath | null> {
    const prevASTs = this.slice(0, -1).reduce(
      (asts, mutation, idx) => {
        const newAST = lodash_cloneDeep(asts[idx]) as ASTNode;
        mutation.apply(newAST);
        asts.push(newAST);

        return asts;
      },
      [oriAST],
    );

    return this.updatePath(prevASTs, paths);
  }

  public updatePath(
    prevASTs: DeepReadonly<ASTNode[]>,
    paths: DeepReadonly<NodePath[]>,
  ): Array<NodePath | null> {
    const rstPaths: Array<NodePath | null> = [];

    for (const path of paths) {
      rstPaths.push(
        this.reduce(
          (currPath: NodePath | null, mutation, idx) => {
            return currPath !== null ? mutation.updateASTPath(prevASTs[idx], currPath) : currPath;
          },
          path as NodePath,
        ),
      );
    }

    return rstPaths;
  }

  public modifiedLocations(originalAST: DeepReadonly<ASTNode>): 'unknown' | CodeRange[] {

    const locations: DeepReadonly<ReturnType<Mutation['modifiedLocations']>>[] = [];
    const nodepathLocMap: Map<NodePath_Stringified, DeepReadonly<CodeRange[]>> = new Map();

    this.mutateAST(originalAST, (ast, _justAppliedMutation, nextMutation) => {
      if (nextMutation !== undefined) {

        const loc = nextMutation.modifiedLocations(ast, nodepathLocMap);

        locations.push(loc);
        if (loc === 'unknown') {
          return false;
        } else {
          // Note: This is just an approximation, but good enough to generate accurate results
          const nodePaths = nextMutation.modifiedNodePath(ast);

          for (const nodePath of nodePaths) {
            nodepathLocMap.set(JSON.stringify(nodePath) as NodePath_Stringified, loc);
          }
        }
      }

      return true;
    });

    if (locations[locations.length - 1] === 'unknown') {
      return 'unknown';
    }

    return lodash_uniqWith(lodash_flatten(locations as CodeRange[][]), lodash_equal);
  }

  public modifiedNodePaths(originalAST: DeepReadonly<ASTNode>): DeepReadonly<NodePath>[] {

    let ret: DeepReadonly<NodePath>[] = [];

    this.mutateAST(originalAST, (ast, _justAppliedMutation, nextMutation) => {
      if (nextMutation !== undefined) {
        ret = ret.map((p) => nextMutation.updateASTPath(ast, p) as NodePath).filter((x) => x !== null);
        ret.push(...nextMutation.modifiedNodePath(ast));
      }
      return true;
    });

    return ret;
  }

  public mutateAST(ast_: DeepReadonly<ASTNode>, intermediateASTVisitor: undefined | ((ast: DeepReadonly<ASTNode>, justAppliedMutation: DeepReadonly<Mutation> | undefined, nextMutation: DeepReadonly<Mutation> | undefined, idx: number, mutationSequence: MutationSequence) => boolean) = undefined): ASTNode {
    const ast = lodash_cloneDeep(ast_) as ASTNode;

    if (intermediateASTVisitor !== undefined && !intermediateASTVisitor(ast, undefined, this[0], -1, this)) {
      return ast;
    }

    for (let i = 0; i < this.length; i++) {
      const mutation = this[i];
      mutation.apply(ast);
      if (intermediateASTVisitor !== undefined && !intermediateASTVisitor(ast, mutation, this[i + 1], i, this)) {
        return ast;
      }
    }

    return ast;
  }

}