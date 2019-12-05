/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */

import { Mutation, DeletionM, InsertionM, FaultSpaceUpdate } from ".";
import RandomMutationGenerator from './RandomMutationGenerator';
import { DeepReadonly, DeepWritable } from "ts-essentials";
import { ASTNode, CodeRange } from "solidity-parser-antlr";
import { NodePath, getASTNodeFromPath, ASTNodeRemoveLocDeep, isASTNode, getNodePathScopeInfo, isNodePathInScope, ASTNodeRemoveExtraAttributesDeep, ASTFunctionalEqualCompareCustomizer, NodePath_Stringified } from "../utils";
import assert from "assert";
import util from 'util';
import FaultSpace from "../FaultSpace";
import MutationSequence from "../MutationSequence";
import { SeededASTNodeSpace } from "../ASTNodeSpace";
import {
    cloneDeep as lodash_cloneDeep,
    isEqual as lodash_equal,
    isEqualWith as lodash_equalWith,
    unionWith as lodash_unionWith,
    remove as lodash_remove,
} from 'lodash';
import debug from 'debug';
import os from 'os';


const debugLogger_MovementM = debug('MoveMutation');
const debugLogger_MovementM_randomGenerator = debugLogger_MovementM.extend('randomGenerator');
const debugLogger_MovementM_randomGenerator_DeletionM = debugLogger_MovementM_randomGenerator.extend('DeletionM');

export default class MovementM extends Mutation {

    public readonly mutationType: string = MovementM.name;
    private readonly mutations: readonly [DeletionM, InsertionM];

    constructor(
        public readonly ast: DeepReadonly<ASTNode>,
        public readonly fromNodePath: DeepReadonly<NodePath>,
        public readonly toPropertyPath: DeepReadonly<NodePath>,
        public readonly insertIndex: number,
    ) {
        super(fromNodePath);

        assert(ast !== undefined);

        this.ast = lodash_cloneDeep(ast); // Clone to avoid extenrally modified
        ASTNodeRemoveExtraAttributesDeep(this.ast as ASTNode);

        const theNode: ASTNode = lodash_cloneDeep(getASTNodeFromPath(this.ast, fromNodePath));

        assert(theNode !== undefined, `fromNodePath ${util.inspect(fromNodePath, false, Infinity, true)} points to invalid non-existent node. AST:\n${this.ast}`);
        ASTNodeRemoveLocDeep(theNode);

        const fstMutation = new DeletionM(fromNodePath);

        const newTargetPath_ = fstMutation.updateASTPath(this.ast, [...toPropertyPath, insertIndex.toString()] as NodePath);
        assert(newTargetPath_ !== null);
        const newTargetPath = newTargetPath_!;

        const newToPropertyPath = newTargetPath.slice(0, -1);
        const newInsertIndex = parseInt(newTargetPath[newTargetPath.length - 1]);
        const sndMutation = new InsertionM(newToPropertyPath, newInsertIndex, theNode);

        assert(!lodash_equal(fromNodePath, newToPropertyPath), `Ineffective MoveMutation - fromNodePath equal to newToPropertyPath`);

        this.mutations = [fstMutation, sndMutation] as const;
    }

    public static fromMutation(
        ast: DeepReadonly<ASTNode>,
        fstMutation: DeepReadonly<DeletionM>,
        sndMutation: DeepReadonly<InsertionM>,
    ) {
        const transformed_insertNodePath = [...sndMutation.targetPropertyPath, sndMutation.insertIndex.toString()] as DeepReadonly<NodePath>;
        const ori_insertNodePath_ = fstMutation.reverseUpdateASTPath(ast, transformed_insertNodePath);

        assert(ori_insertNodePath_ !== null);

        const ori_insertIndex = parseInt(ori_insertNodePath_!.splice(-1, 1)[0]);
        const ori_toPropertyPath = ori_insertNodePath_!;

        return new MovementM(ast, fstMutation.targetNodePath, ori_toPropertyPath, ori_insertIndex);
    }

    public toString(): string {
        return JSON.stringify({
            mutationType: this.mutationType,
            fromNodePath: this.fromNodePath,
            toPropertyPath: this.toPropertyPath,
            insertIndex: this.insertIndex,
        });
    }

    public toJSON(): {
        readonly ast: ASTNode,
        readonly mutationType: MovementM['mutationType'],
        readonly fromNodePath: MovementM['fromNodePath'],
        readonly toPropertyPath: MovementM['toPropertyPath'],
        readonly insertIndex: MovementM['insertIndex'],
    } {

        const ast_withoutLoc = lodash_cloneDeep(this.ast) as ASTNode;
        ASTNodeRemoveLocDeep(ast_withoutLoc);

        return {
            ast: ast_withoutLoc,
            mutationType: this.mutationType,
            fromNodePath: this.fromNodePath,
            toPropertyPath: this.toPropertyPath,
            insertIndex: this.insertIndex,
        };
    }

    public apply(ast: ASTNode): void {

        assert(lodash_equalWith(ast, this.ast, ASTFunctionalEqualCompareCustomizer), `MoveMutation is applied on AST that is not intended!${os.EOL}Intended AST:${os.EOL}${util.inspect(this.ast, true, Infinity, true)}${os.EOL}Provided AST:${os.EOL}${util.inspect(ast, true, Infinity, true)}`);
        for (const mutation of this.mutations) {
            mutation.apply(ast);
        }

    }

    public updateASTPath(ast: DeepReadonly<ASTNode>, path: DeepReadonly<NodePath>): NodePath | null {
        const ret1 = this.mutations[0].updateASTPath(ast, path);
        if (ret1 === null) {
            if (lodash_equal(path, this.fromNodePath)) {
                return [...this.mutations[1].targetPropertyPath, this.mutations[1].insertIndex.toString()] as NodePath;
            } else {
                return null;
            }
        }

        const ret2 = this.mutations[1].updateASTPath(ast, ret1);
        return ret2;
    }

    public reverseUpdateASTPath(ast: DeepReadonly<ASTNode>, path: DeepReadonly<NodePath>): NodePath | null {

        if (lodash_equal(path, [...this.mutations[1].targetPropertyPath, this.mutations[1].insertIndex.toString()])) {
            return lodash_cloneDeep(this.fromNodePath) as NodePath;
        }

        let retPath = path as DeepWritable<typeof path>;

        for (const mutation of this.mutations.slice().reverse()) {
            const ret = mutation.reverseUpdateASTPath(ast, retPath);
            if (ret === null) {
                return null;
            }
            retPath = ret;
        }

        return retPath;
    }

    public rebase(
        oriAST: DeepReadonly<ASTNode>,
        fromMutationSequence: MutationSequence,
        beforeMutationASTs: DeepReadonly<ASTNode[]>,
        afterMutationSequence: MutationSequence,
        afterMutationASTs: DeepReadonly<ASTNode[]>,
    ): MovementM | undefined {
        assert(beforeMutationASTs.length === fromMutationSequence.length);
        assert(afterMutationASTs.length === afterMutationSequence.length);
        assert(beforeMutationASTs.every((x) => isASTNode(x as ASTNode)));
        assert(afterMutationASTs.every((x) => isASTNode(x as ASTNode)));

        const newFstMutation = this.mutations[0].rebase(
            oriAST,
            fromMutationSequence,
            beforeMutationASTs,
            afterMutationSequence,
            afterMutationASTs,
        );

        if (newFstMutation === undefined) {
            return undefined;
        }

        const fstMutationBaseAST = afterMutationASTs.length === 0 ? oriAST : afterMutationASTs[afterMutationSequence.length - 1];
        const newAftFstMutationAST = lodash_cloneDeep(fstMutationBaseAST) as ASTNode;
        newFstMutation.apply(newAftFstMutationAST);

        const newSndMutation = this.mutations[1].rebase(
            oriAST,
            new MutationSequence(...[...fromMutationSequence, this.mutations[0]]),
            [...beforeMutationASTs, this.ast],
            new MutationSequence(...[...afterMutationSequence, newFstMutation]),
            [...afterMutationASTs, newAftFstMutationAST],
        );

        if (newSndMutation === undefined) {
            return undefined;
        }

        return MovementM.fromMutation(
            fstMutationBaseAST,
            newFstMutation,
            newSndMutation,
        );
    }

    public static randomGenerator(
        ast: DeepReadonly<ASTNode>,
        faultSpace: DeepReadonly<FaultSpace[]>,
        onlySameFunction: boolean = true,
        rng: Chance.Chance,
    ): RandomMutationGenerator_MoveMutation {
        return new RandomMutationGenerator_MoveMutation(ast, faultSpace, onlySameFunction, rng);
    }

    public modifiedLocations(ast: DeepReadonly<ASTNode>, nodepathLocMap: Map<NodePath_Stringified, DeepReadonly<CodeRange[]>> = new Map() ): DeepReadonly<CodeRange[]> | 'unknown' {
        const fstMutationLocs = this.mutations[0].modifiedLocations(ast, nodepathLocMap);
        const astAfterFstMutation = lodash_cloneDeep(ast) as ASTNode;
        this.mutations[0].apply(astAfterFstMutation);
        const nodepathLocMap_forSndMutation = new Map([...nodepathLocMap.entries()].map(([k, v])=> {
            const nodePath = JSON.parse(k) as NodePath;
            const newNodePath = this.mutations[0].updateASTPath(ast, nodePath);
            return newNodePath === null ? null : [JSON.stringify(newNodePath) as NodePath_Stringified, v];
        }).filter((x)=>x!== null) as [NodePath_Stringified, DeepReadonly<CodeRange[]>][]);
        const sndMutationLocs = this.mutations[1].modifiedLocations(astAfterFstMutation, nodepathLocMap_forSndMutation);

        const mutationLocs = [fstMutationLocs, sndMutationLocs];

        assert(mutationLocs.every((x) => x.length !== 0));

        if (mutationLocs.includes('unknown')) {
            return 'unknown';
        } else {
            return lodash_unionWith(fstMutationLocs as DeepReadonly<CodeRange[]>, sndMutationLocs as DeepReadonly<CodeRange[]>, lodash_equal);
        }

    }

    public modifiedNodePath(ast: DeepReadonly<ASTNode>): DeepReadonly<NodePath[]> {
        const ret1 = this.mutations[0].modifiedNodePath(ast);

        const intermediateAST = lodash_cloneDeep(ast) as ASTNode;
        this.mutations[0].apply(intermediateAST);

        const ret2 = this.mutations[1].modifiedNodePath(intermediateAST);
        return [...ret1, ...ret2];
      }
    
}

class RandomMutationGenerator_MoveMutation extends RandomMutationGenerator<MovementM> {

    private arr_pair_deletionMInsertionMutationGen: { deletionM: DeletionM, insertionMutationGen: ReturnType<typeof InsertionM.randomGenerator> }[] = [];

    public constructor(public readonly ast: DeepReadonly<ASTNode>,
        faultSpace: DeepReadonly<FaultSpace[]>,
        private readonly onlySameFunction: boolean = true,
        private readonly rng: Chance.Chance) {

        super();

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

        assert(this.updateFaultSpace({
            updateType: 'add',
            faultSpaces: faultSpace
        }));

    }

    public updateFaultSpace(faultSpaceUpdateObj: FaultSpaceUpdate): boolean {
        switch (faultSpaceUpdateObj.updateType) {
            case 'add': {

                const faultSpace = faultSpaceUpdateObj.faultSpaces;

                const allPossibleDeletionM = [...DeletionM.randomGenerator(this.ast, faultSpace, this.rng)] as DeletionM[];
                debugLogger_MovementM_randomGenerator_DeletionM(allPossibleDeletionM);
                 const new_arr_pair_deletionMInsertionMGen = allPossibleDeletionM.map(
                    (deletionM) => {
                        const nodeTobeDeleted = getASTNodeFromPath(this.ast, deletionM!.targetNodePath);

                        let faultSpace_ = faultSpace;
                        if (this.onlySameFunction) {
                            const info = getNodePathScopeInfo(this.ast, deletionM.targetNodePath);

                            if (info.functionName !== undefined) {
                                // No need to update `faultSpace` since it's unused below
                                faultSpace_ = faultSpace_.filter((x) => isNodePathInScope(this.ast, x.nodePath, info.contractName !== undefined ? [info.contractName] : undefined, info.functionName !== undefined ? [info.functionName] : undefined));
                            }
                        }

                        const ASTaftDeletionM = lodash_cloneDeep(this.ast) as ASTNode;
                        deletionM!.apply(ASTaftDeletionM);

                        const faultSpace_insertionMutation = faultSpace_.map(({ nodePath }) => { return { nodePath: deletionM!.updateASTPath(this.ast, nodePath) }; }).filter(({ nodePath }) => nodePath !== null) as DeepReadonly<FaultSpace[]>;

                        return { deletionM: deletionM!, insertionMutationGen: InsertionM.randomGenerator(ASTaftDeletionM, faultSpace_insertionMutation, SeededASTNodeSpace.getSeededASTNodeSpace([nodeTobeDeleted]), ['ExpressionStatement'], this.rng) };
                    }
                );

                this.arr_pair_deletionMInsertionMutationGen = lodash_unionWith(this.arr_pair_deletionMInsertionMutationGen, new_arr_pair_deletionMInsertionMGen, lodash_equal);
                return true;
            }
            case 'remove': {
                const DMgen = DeletionM.randomGenerator(this.ast, faultSpaceUpdateObj.faultSpaces, this.rng);
                lodash_remove(this.arr_pair_deletionMInsertionMutationGen, (x)=>DMgen.isMutationInRemainingSpace(x.deletionM));

                for(const space of this.arr_pair_deletionMInsertionMutationGen){
                    assert(space.insertionMutationGen.updateFaultSpace(faultSpaceUpdateObj));
                }

                return true;
            }
            case 'intersect': {
                const DMgen = DeletionM.randomGenerator(this.ast, faultSpaceUpdateObj.faultSpaces, this.rng);
                lodash_remove(this.arr_pair_deletionMInsertionMutationGen, (x)=>!DMgen.isMutationInRemainingSpace(x.deletionM));

                for(const space of this.arr_pair_deletionMInsertionMutationGen){
                    assert(space.insertionMutationGen.updateFaultSpace(faultSpaceUpdateObj));
                }

                return true;
            }
            default: {
                throw new UnimplementedError();
            }
        }
    }

    public next(): IteratorResult<MovementM | undefined> {
        while (this.arr_pair_deletionMInsertionMutationGen.length !== 0) {

            const chosen_idx = this.rng.integer({ min: 0, max: this.arr_pair_deletionMInsertionMutationGen.length - 1 });
            const pair_deletionMInsertionMGen = this.arr_pair_deletionMInsertionMutationGen[chosen_idx];

            const deletionM = pair_deletionMInsertionMGen.deletionM;
            const insertionM = pair_deletionMInsertionMGen.insertionMutationGen.next().value;

            if (insertionM === undefined) {
                this.arr_pair_deletionMInsertionMutationGen.splice(chosen_idx, 1);
                continue;
            }

            if (lodash_equal(deletionM.targetNodePath, [...(insertionM.targetPropertyPath), insertionM.insertIndex.toString()])) {
                // Skip this, since it will create a MoveMutation that does nothing
                continue;
            }

            return { value: MovementM.fromMutation(this.ast, deletionM, insertionM), done: false };
        }

        return { value: undefined, done: true };
    }

    public isMutationInRemainingSpace(_mutation: MovementM): boolean {
        throw new UnimplementedError();
    }

    public numMutationRemaining(): number {
        throw new UnimplementedError();
    }
}