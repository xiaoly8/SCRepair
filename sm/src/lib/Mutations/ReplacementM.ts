/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import { Mutation, FaultSpaceUpdate } from ".";
import { DeepReadonly, DeepWritable, Writable } from "ts-essentials";
import { NodePath, arrStartsWithArr, isASTNode, astNodeContainsNonEmptyBlock, getNodePathScopeInfo } from "../utils";
import { ASTNode, ASTNodeTypeString } from "solidity-parser-antlr";
import assert from "assert";
import util from 'util';
import MutationSequence, { rebasePath } from "../MutationSequence";
import FaultSpace, { getFaultSpaceNodePair } from "../FaultSpace";
import ASTNodeSpace, { NewNodeGenerationContext } from "../ASTNodeSpace";
import os from 'os';
import {
    cloneDeep as lodash_cloneDeep,
    update as lodash_update,
    pull as lodash_pull,
    isEqual as lodash_equal,
    pullAllWith as lodash_pullAllWith,
    unionWith as lodash_unionWith,
    intersectionWith as lodash_intersectionWith,
} from 'lodash';
import debug from 'debug';
import RandomMutationGenerator from "./RandomMutationGenerator";


const debugLogger_space = debug('space');
const debugLogger_replaceableSpace = debugLogger_space.extend('replaceableSpace');

export class ReplacementM extends Mutation {

    public readonly transformFunc: (oriNode: ASTNode) => void;
    
    public apply(ast: ASTNode) {
        lodash_update(ast, this.targetNodePath, oriTargetNode => this.transformFunc(oriTargetNode));
    }

    public updateASTPath(_ast: DeepReadonly<ASTNode>, path: DeepReadonly<NodePath>): NodePath | null {
        // Note: This could be improved

        if (arrStartsWithArr(path, this.targetNodePath) && path.length !== this.targetNodePath.length) {
            // Since the structure of the node might even be thoroughly changed, we mark path pointing to subnodes of the original replaced node invalid
            return null;
        }

        return path as DeepWritable<typeof path>;
    }

    public reverseUpdateASTPath(_ast: DeepReadonly<ASTNode>, path: DeepReadonly<NodePath>): NodePath | null {
        // Note: This could be improved
        return this.updateASTPath(_ast, path);
    }

    public modifiedNodePath(_ast: DeepReadonly<ASTNode>): DeepReadonly<NodePath[]> {
        return [this.targetNodePath];
    }
    
    private static transformNodeFunc(oriNode: DeepReadonly<ASTNode>, newNode_: DeepReadonly<ASTNode>): ASTNode {

        assert(isASTNode(oriNode), `oriNode is not an ASTNode: ${os.EOL}${util.inspect(oriNode, false, Infinity, true)}`);

        const newNode = lodash_cloneDeep(newNode_) as DeepWritable<typeof newNode_>;

        // const arrTypeAttributes = (Object.keys(oriNode) as Array<keyof typeof oriNode>).filter(k =>
        //   Array.isArray((oriNode as any)[k]),
        // );
        // for (const attr of arrTypeAttributes) {
        //   newNode[attr] = oriNode[attr] as any;
        // }

        return newNode as ASTNode;
    }
    public readonly mutationType: string = ReplacementM.name;

    constructor(public readonly targetNodePath: DeepReadonly<NodePath>, public readonly newNode: DeepReadonly<ASTNode>) {
        super(targetNodePath);
        this.transformFunc = oriNode => ReplacementM.transformNodeFunc(oriNode, newNode);
    }

    public rebase(
        oriAST: DeepReadonly<ASTNode>,
        fromMutationSequence: MutationSequence,
        beforeMutationASTs: DeepReadonly<ASTNode[]>,
        afterMutationSequence: MutationSequence,
        afterMutationASTs: DeepReadonly<ASTNode[]>,
    ): ReplacementM | undefined {
        const newTargetNodePath = rebasePath(
            this.targetNodePath,
            oriAST,
            fromMutationSequence,
            beforeMutationASTs,
            afterMutationSequence,
            afterMutationASTs,
        );
        return newTargetNodePath !== undefined ? new ReplacementM(newTargetNodePath, this.newNode) : undefined;
    }

    public toJSON(): {
        readonly mutationType: string, readonly targetNodePath: DeepReadonly<NodePath>, readonly newNode: DeepReadonly<ASTNode>
    } {

        return {
            mutationType: ReplacementM.name,
            targetNodePath: this.targetNodePath,
            newNode: this.newNode
        }
    }

    public static randomGenerator(
        forAST: DeepReadonly<ASTNode>,
        faultSpaces: readonly DeepReadonly<FaultSpace>[],
        astNodeSpace: ASTNodeSpace,
        replaceNodeType: ASTNodeTypeString[],
        newNodeTypeSpace: readonly ASTNodeTypeString[],
        rng: Chance.Chance,
    ): RandomMutationGenerator_ReplacementM {
        return new RandomMutationGenerator_ReplacementM(forAST, faultSpaces, astNodeSpace, replaceNodeType, newNodeTypeSpace, rng);
    }

}

class RandomMutationGenerator_ReplacementM extends RandomMutationGenerator<ReplacementM> {

    private supportedReplaceableNodes: readonly
        [DeepReadonly<FaultSpace>, readonly ASTNodeTypeString[], NewNodeGenerationContext][] = [];

    private readonly chosenNodeNewNodeGen: Map<
        DeepReadonly<FaultSpace>,
        Map<ASTNodeTypeString, IterableIterator<ASTNode>>
    > = new Map();

    public constructor(private readonly forAST: DeepReadonly<ASTNode>,
        faultSpaces: readonly DeepReadonly<FaultSpace>[],
        private readonly astNodeSpace: ASTNodeSpace,
        private readonly replaceNodeType: ASTNodeTypeString[],
        private readonly newNodeTypeSpace: readonly ASTNodeTypeString[],
        private readonly rng: Chance.Chance) {

        super();

        assert(this.updateFaultSpace({
            updateType: 'add',
            faultSpaces: faultSpaces,
        }));

    }

    public next() {
        while (true) {

            if (this.supportedReplaceableNodes.length === 0) {
                return { value: undefined, done: true };
            }

            const chosenNode = this.rng.weighted(this.supportedReplaceableNodes as Writable<RandomMutationGenerator_ReplacementM['supportedReplaceableNodes']>, this.supportedReplaceableNodes.map((_x) => 1));
            const chosenFaultSpace = chosenNode[0];
            const newNodeGenerationCtx = chosenNode[2];

            assert(chosenNode[1].length !== 0);

            const chosenNodeType = this.rng.pickone(chosenNode[1] as Writable<typeof chosenNode[1]>); // Note: likely to generate non-compilable code

            let newNodeGens: ReturnType<RandomMutationGenerator_ReplacementM['chosenNodeNewNodeGen']['get']>;
            if ((newNodeGens = this.chosenNodeNewNodeGen.get(chosenFaultSpace)) === undefined) {
                newNodeGens = new Map();
                this.chosenNodeNewNodeGen.set(chosenFaultSpace, newNodeGens);
            }

            let newNodeGen: ReturnType<typeof newNodeGens.get>;
            if ((newNodeGen = newNodeGens.get(chosenNodeType)) === undefined) {
                newNodeGen = this.astNodeSpace.getASTNodeGenerator(chosenNodeType, newNodeGenerationCtx, this.rng.integer());
                newNodeGens.set(chosenNodeType, newNodeGen);
            }

            const newNode = newNodeGen.next().value;

            if (newNode === undefined) {
                // For this node path, chosenNodeType can't generate any new node
                // Potentially can free some memory here
                lodash_pull(chosenNode[1], chosenNodeType);
                if (chosenNode[1].length === 0) {
                    lodash_pull(this.supportedReplaceableNodes, chosenNode);
                }

                continue;
            }

            return { value: new ReplacementM(chosenFaultSpace.nodePath, newNode), done: false };
        }

    }

    public isMutationInRemainingSpace(mutation: ReplacementM): boolean {
        const supportedReplaceableNode = this.supportedReplaceableNodes.find((space) => lodash_equal(space[0].nodePath, mutation.targetNodePath));
        if (supportedReplaceableNode === undefined) {
            return false;
        }

        if (!supportedReplaceableNode[1].includes(mutation.newNode.type)) {
            return false;
        }

        return this.astNodeSpace.isNodeInSpace(mutation.newNode, supportedReplaceableNode[2]);
    }

    public updateFaultSpace(faultSpaceUpdateObj: FaultSpaceUpdate): boolean {
        switch (faultSpaceUpdateObj.updateType) {
            case 'add': {

                // WARNING: current design only expects add request will only be done once!

                const faultSpace_Node = getFaultSpaceNodePair(this.forAST, faultSpaceUpdateObj.faultSpaces);

                // const ignoredAttributes = ['range', 'loc', 'comments'];
                const newSupportedReplacableNodes
                    = faultSpace_Node.reduce(
                        (acc, x) => {
                            if (!this.replaceNodeType.includes(x[1].type) || astNodeContainsNonEmptyBlock(x[1])) {
                                return acc;
                            }

                            // const arrTypeAttributes = Object.keys(x[1]).filter(
                            //     k => Array.isArray((x[1] as any)[k]) && !ignoredAttributes.includes(k),
                            // );

                            const newNodeGenerationCtx = new NewNodeGenerationContext(getNodePathScopeInfo(this.forAST, x[0].nodePath), x[1].loc);

                            // const nodeTypeReplaceWith = newNodeTypeSpace.filter(t => {
                            //     const space = astNodeSpace[t](newNodeGenerationCtx);
                            //     return (
                            //         typeof space !== 'undefined' &&
                            //         arrTypeAttributes.every(x => (typeof (space as any)[x] === 'function' || Array.isArray((space as any)[x])))
                            //     );
                            // });
                            const nodeTypeReplaceWith = [...this.newNodeTypeSpace];

                            if (nodeTypeReplaceWith.length !== 0) {
                                acc.push([x[0], nodeTypeReplaceWith, newNodeGenerationCtx]);
                            }

                            return acc;
                        },
                        [] as [DeepReadonly<FaultSpace>, readonly ASTNodeTypeString[], NewNodeGenerationContext][],
                    );

                this.supportedReplaceableNodes = lodash_unionWith(newSupportedReplacableNodes, this.supportedReplaceableNodes, (a, b)=> lodash_equal(a[0].nodePath, b[0].nodePath) );

                debugLogger_replaceableSpace(this.supportedReplaceableNodes);
                return true;

            }
            case 'remove': {
                lodash_pullAllWith(this.supportedReplaceableNodes, faultSpaceUpdateObj.faultSpaces, (replaceableNode, faultSpace) => lodash_equal(replaceableNode[0].nodePath, faultSpace.nodePath));
                return true;
            }
            case 'intersect': {
                // Done
                lodash_intersectionWith(this.supportedReplaceableNodes, faultSpaceUpdateObj.faultSpaces, (replaceableNode, faultSpace) => lodash_equal(replaceableNode[0].nodePath, faultSpace.nodePath));
                return true;
            }
            default: {
                throw new UnimplementedError();
            }
        }
    }

    public numMutationRemaining(): number {
        throw new UnimplementedError();
    }

}