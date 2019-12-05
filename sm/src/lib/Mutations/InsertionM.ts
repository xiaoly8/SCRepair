/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */

import Mutation from "./Mutation";
import { FaultSpaceUpdate } from '.';
import RandomMutationGenerator from './RandomMutationGenerator';
import { DeepReadonly, DeepWritable } from "ts-essentials";
import { NodePath, NodePropertyPath, disallowKeys, getASTNodeFromPath, findASTParentNode, getNodePathScopeInfo, NodePath_Stringified } from "../utils";
import { ASTNode, ASTNodeTypeString, CodeRange } from "solidity-parser-antlr";
import assert from "assert";
import util from "util";
import MutationSequence, { rebasePath } from "../MutationSequence";
import FaultSpace, { getFaultSpaceNodePair } from "../FaultSpace";
import ASTNodeSpace, { NewNodeGenerationContext } from "../ASTNodeSpace";
import {
    cloneDeep as lodash_cloneDeep,
    get as lodash_get,
    pull as lodash_pull,
    flatMap as lodash_flatMap,
    range as lodash_range,
    isEqual as lodash_equal,
    unionWith as lodash_unionWith,
} from 'lodash';
import debug from 'debug';
import os from 'os';


const debugLogger_space = debug('space');
const debugLogger_insertableSpace = debugLogger_space.extend('InsertableSpace');
const debugLogger_insertableSpace_insertableLocations = debugLogger_insertableSpace.extend('insertableLocations');


/*
    Mutation that will add a new node
*/
export default class InsertionM extends Mutation {
    public readonly mutationType: string = InsertionM.name;

    constructor(public readonly targetPropertyPath: DeepReadonly<NodePath>, public readonly insertIndex: number, public readonly newNode: DeepReadonly<ASTNode>) {
        // NOTE: Assume the property is an immediate attribute of the target node
        super(targetPropertyPath.slice(0, -1));
    }

    public apply(ast: ASTNode): void {
        const children: ASTNode[] = lodash_get(ast, this.targetPropertyPath);
        assert(
            Array.isArray(children),
            `Property with path ${util.inspect(
                this.targetPropertyPath,
                false,
                Infinity,
                true,
            )} expected to be an array! targetNode =\n${util.inspect(
                lodash_get(ast, this.targetNodePath),
                true,
                Infinity,
                true,
            )}`,
        );
        assert(this.insertIndex <= children.length, `InsertIndex ${this.insertIndex} is larger than AST array length ${children.length}!${os.EOL}Mutation: ${util.inspect(this, true, Infinity, true)}`);
        children.splice(this.insertIndex, 0, lodash_cloneDeep(this.newNode) as ASTNode);
    }

    public updateASTPath(_ast: DeepReadonly<ASTNode>, path: DeepReadonly<NodePath>): NodePath {
        if (this.targetPropertyPath.every((x, idx) => x === path[idx]) && path.length > this.targetPropertyPath.length) {
            const target = path[this.targetPropertyPath.length];
            assert(typeof target === 'string');

            const targetNum = parseInt(target);
            if (targetNum >= this.insertIndex) {
                const newPath = lodash_cloneDeep(path) as DeepWritable<typeof path>;
                newPath[this.targetPropertyPath.length] = (targetNum + 1).toString() as any;
                return newPath;
            }
        }

        return path as DeepWritable<typeof path>;
    }

    public reverseUpdateASTPath(_ast: DeepReadonly<ASTNode>, path: DeepReadonly<NodePath>): NodePath {
        if (this.targetPropertyPath.every((x, idx) => x === path[idx]) && path.length > this.targetPropertyPath.length) {
            // The path points to an element passing through the this.targetPropertyPath

            const target = path[this.targetPropertyPath.length];
            assert(typeof target === 'string');

            const targetNum = parseInt(target);
            if (targetNum - 1 >= this.insertIndex) {
                // 1 was added to the targetNum
                const newPath = lodash_cloneDeep(path) as DeepWritable<typeof path>;
                newPath[this.targetPropertyPath.length] = (targetNum - 1).toString() as any;
                return newPath;
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
    ): InsertionM | undefined {
        const insertionLocationNodePath = [...this.targetPropertyPath, this.insertIndex.toString()] as NodePath;

        const newInsertionLocationNodePath_ = rebasePath(
            insertionLocationNodePath,
            oriAST,
            fromMutationSequence,
            beforeMutationASTs,
            afterMutationSequence,
            afterMutationASTs,
        );

        if (newInsertionLocationNodePath_ === undefined) {
            return undefined;
        }

        const newInsertIndex = parseInt(newInsertionLocationNodePath_.splice(-1, 1)[0]);
        const newTargetPropertyPath = newInsertionLocationNodePath_;

        return new InsertionM(newTargetPropertyPath, newInsertIndex, this.newNode);
    }

    public static randomGenerator(
        forAST: DeepReadonly<ASTNode>,
        faultSpace_Node: DeepReadonly<FaultSpace[]>,
        astNodeSpace: ASTNodeSpace,
        insertionNewNodeTypeSpace: ASTNodeTypeString[] = ['ExpressionStatement'],
        rng: Chance.Chance,
    ): RandomMutationGenerator_InsertionM {
        return new RandomMutationGenerator_InsertionM(forAST, faultSpace_Node, astNodeSpace, insertionNewNodeTypeSpace, rng);
    }

    public modifiedLocations(ast: DeepReadonly<ASTNode>, nodepathLocMap: Map<NodePath_Stringified, DeepReadonly<CodeRange[]>> = new Map()): DeepReadonly<CodeRange[]> | 'unknown' {
        const node = getASTNodeFromPath(ast, findASTParentNode(ast, this.targetPropertyPath)!) as DeepReadonly<ASTNode>;

        if (node.loc !== undefined) {
            return [node.loc] as const;
        } else {
            const matchingLoc = nodepathLocMap.get(JSON.stringify(this.targetNodePath) as NodePath_Stringified);
            return matchingLoc !== undefined ? matchingLoc : 'unknown';
        }
    }

    public modifiedNodePath(_ast: DeepReadonly<ASTNode>): DeepReadonly<NodePath[]> {
        return [[...this.targetPropertyPath, this.insertIndex.toString()] as NodePath];
    }

}

class RandomMutationGenerator_InsertionM extends RandomMutationGenerator<InsertionM> {

    private readonly insertionNewNodeGens: Map<
        ASTNodeTypeString,
        Map<string, IterableIterator<ASTNode>>
    > = new Map();

    private insertableSpaces: DeepReadonly<{
        readonly fromFaultSpace: DeepReadonly<FaultSpace>,
        readonly propertyPath: NodePropertyPath;
        readonly insertIndex: number;
        readonly weigh: number;
        newNodeGenerationCtx: NewNodeGenerationContext;
    }[]> = [];

    private insertionNewNodeTypeSpace: ASTNodeTypeString[];

    public updateFaultSpace(faultSpaceUpdateObj: FaultSpaceUpdate): boolean {

        switch (faultSpaceUpdateObj.updateType) {
            case 'add': {

                // WARNING: current design only expects add request will only be done once!

                const faultSpace_Node = getFaultSpaceNodePair(this.forAST, faultSpaceUpdateObj.faultSpaces);

                const insertablePropertyPaths_: {
                    readonly fromFaultSpace: DeepReadonly<FaultSpace>,
                    readonly propertyPath: NodePropertyPath;
                    readonly property: any[];
                    readonly newNodeGenerationCtx: NewNodeGenerationContext;
                }[] = lodash_flatMap(faultSpace_Node, x =>
                    // TODO; this is only doing for one level. Is there a need to support deeper level?
                    Object.keys(x[1])
                        .filter(k => Array.isArray((x[1] as any)[k]) && !disallowKeys.has(k as any)) // Can only add new nodes to array type of properties
                        .map(k => {
                            const propertyPath = [...(x[0].nodePath), k] as NodePropertyPath;
                            return { fromFaultSpace: x[0], propertyPath, property: (x[1] as any)[k], newNodeGenerationCtx: new NewNodeGenerationContext(getNodePathScopeInfo(this.forAST, propertyPath), undefined) };
                        }),
                );

                debugLogger_insertableSpace(util.inspect(insertablePropertyPaths_.map(({ propertyPath, property }) => { return { propertyPath, property } }), true, Infinity, true));

                const new_insertableSpaces = lodash_flatMap(insertablePropertyPaths_, x =>
                    lodash_range(0, x.property.length + 1).map(idx => {
                        let weigh: number = 1;
                        return { fromFaultSpace: x.fromFaultSpace, propertyPath: x.propertyPath, insertIndex: idx, weigh, newNodeGenerationCtx: x.newNodeGenerationCtx };
                    }),
                );

                this.insertableSpaces = lodash_unionWith(this.insertableSpaces, new_insertableSpaces, (a, b) => lodash_equal({ propertyPath: a.propertyPath, insertIndex: a.insertIndex }, { propertyPath: b.propertyPath, insertIndex: b.insertIndex }));

                debugLogger_insertableSpace_insertableLocations(this.insertableSpaces);

                return true;
            }
            case 'intersect': {
                this.insertableSpaces = this.insertableSpaces.filter((s) => faultSpaceUpdateObj.faultSpaces.some((x) => lodash_equal(s.fromFaultSpace.nodePath, x.nodePath)));
                return true;
            }
            case 'remove': {
                this.insertableSpaces = this.insertableSpaces.filter((s) => !faultSpaceUpdateObj.faultSpaces.some((x) => lodash_equal(s.fromFaultSpace.nodePath, x.nodePath)));
                return true;
            }
            default: {
                throw new UnimplementedError();
            }
        }
    }

    public constructor(public readonly forAST: DeepReadonly<ASTNode>,
        faultSpaces: DeepReadonly<FaultSpace[]>,
        public readonly astNodeSpace: ASTNodeSpace,
        public readonly original_insertionNewNodeTypeSpace: readonly ASTNodeTypeString[] = ['ExpressionStatement'],
        public readonly rng: Chance.Chance) {

        super();

        // We can only insert ExpressionStatement

        this.insertionNewNodeTypeSpace = [...original_insertionNewNodeTypeSpace];

        assert(this.updateFaultSpace({
            updateType: 'add',
            faultSpaces: faultSpaces
        }));

    }

    public next(): IteratorResult<InsertionM | undefined> {

        while (this.insertableSpaces.length !== 0 && this.insertionNewNodeTypeSpace.length !== 0) {

            const pair_insertablePropertyPath_insertableIndex = this.rng.weighted(
                this.insertableSpaces as DeepWritable<RandomMutationGenerator_InsertionM['insertableSpaces']>,
                this.insertableSpaces.map((x) => x.weigh)
            ) as RandomMutationGenerator_InsertionM['insertableSpaces'][number];
            const chosenPropertyPath = pair_insertablePropertyPath_insertableIndex.propertyPath;
            const chosenNodeType = this.rng.pickone(this.insertionNewNodeTypeSpace) as ASTNodeTypeString; // Note: likely to generate non-compilable code

            const newNodeGenerationCtx = pair_insertablePropertyPath_insertableIndex.newNodeGenerationCtx;

            let map_InsertLoc_NodeGen;
            if ((map_InsertLoc_NodeGen = this.insertionNewNodeGens.get(chosenNodeType)) === undefined) {
                map_InsertLoc_NodeGen = new Map();
                this.insertionNewNodeGens.set(chosenNodeType, map_InsertLoc_NodeGen);
            }

            const serialized_pair_insertablePropertyPath_insertableIndex = JSON.stringify(
                pair_insertablePropertyPath_insertableIndex,
            );
            let nodeGen;
            if (
                (nodeGen = map_InsertLoc_NodeGen.get(serialized_pair_insertablePropertyPath_insertableIndex)) === undefined
            ) {
                nodeGen = this.astNodeSpace.getASTNodeGenerator(chosenNodeType, newNodeGenerationCtx, this.rng.seed);
                map_InsertLoc_NodeGen.set(serialized_pair_insertablePropertyPath_insertableIndex, nodeGen);
            }

            const insertIndex: number = pair_insertablePropertyPath_insertableIndex.insertIndex;

            const newNode = nodeGen.next().value;
            // assert(newNode !== undefined, `newNode for node type ${chosenNodeType} is undefined!`);

            if (newNode === undefined) {
                // No element can be generated from this node type
                lodash_pull(this.insertionNewNodeTypeSpace, chosenNodeType);
                continue;
            }

            return { value: new InsertionM(chosenPropertyPath, insertIndex, newNode), done: false };
        }

        return { value: undefined, done: true };
    }

    public isMutationInRemainingSpace(mutation: InsertionM): boolean {
        const insertableSpace = this.insertableSpaces.find((x) => x.propertyPath === mutation.targetPropertyPath && x.insertIndex === mutation.insertIndex);

        if (insertableSpace === undefined) {
            return false;
        }

        return this.astNodeSpace.isNodeInSpace(mutation.newNode, insertableSpace.newNodeGenerationCtx);
    }

    public numMutationRemaining(): number {
        throw new UnimplementedError();
    }
}