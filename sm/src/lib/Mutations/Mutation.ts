/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import { DeepReadonly } from "ts-essentials";
import { NodePath, getASTNodeFromPath, NodePath_Stringified } from "../utils";
import { ASTNode, CodeRange } from "solidity-parser-antlr";
import MutationSequence from "../MutationSequence";

export default abstract class Mutation {
  /*
        targetNodePath: the dot object path to get to the target node from the root node of the AST
    */

  public abstract readonly mutationType: string;

  constructor(public targetNodePath: DeepReadonly<NodePath>) { }

  public abstract apply(ast: ASTNode): void;

  public abstract updateASTPath(ast: DeepReadonly<ASTNode>, path: DeepReadonly<NodePath>): NodePath | null;

  public abstract reverseUpdateASTPath(ast: DeepReadonly<ASTNode>, path: DeepReadonly<NodePath>): NodePath | null;

  public abstract rebase(
    oriAST: DeepReadonly<ASTNode>,
    fromMutationSequence: MutationSequence,
    beforeMutationASTs: DeepReadonly<ASTNode[]>,
    afterMutationSequence: MutationSequence,
    afterMutationASTs: DeepReadonly<ASTNode[]>,
  ): Mutation | undefined;

  public static *randomGenerator(..._args: any[]): IterableIterator<Mutation | undefined> {
    throw new Error("UnimplementedError: randomGenerator");
  }

  public modifiedLocations(ast: DeepReadonly<ASTNode>, nodepathLocMap: Map<NodePath_Stringified, DeepReadonly<CodeRange[]>> = new Map() ): DeepReadonly<CodeRange[]> | 'unknown' {
    const node = getASTNodeFromPath(ast, this.targetNodePath) as DeepReadonly<ASTNode>;

    if (node.loc !== undefined) {
      return [node.loc] as const;
    } else {
      const matchingLoc = nodepathLocMap.get(JSON.stringify(this.targetNodePath) as NodePath_Stringified);
      return matchingLoc !== undefined ? matchingLoc : 'unknown';
    }
  }

  public abstract modifiedNodePath(ast: DeepReadonly<ASTNode>): DeepReadonly<NodePath[]>;
}