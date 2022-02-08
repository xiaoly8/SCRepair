/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import {
  zip as lodash_zip
  , mapValues as lodash_mapValues,
  isEqual as lodash_equal,
  without as lodash_without,
  uniq as lodash_uniq,
} from 'lodash';
import { Visitor, Statement } from 'solidity-parser-antlr';
import { Opaque, Merge } from 'ts-essentials';
import logger from '../utils/logger';
import debug from '../utils/debug';
import { a2S } from '../utils/SRCUtils';
import MutationSequence from './MutationSequence';
import {
  compile, NodePath, Seed, visitWithPath, ASTNodeRemoveExtraAttributesDeep,
  stripSwarmMetadata
} from './utils';
import FaultSpace, { getFaultSpaceNodePath } from './FaultSpace';
import os from 'os';
import util from 'util';
import g from '../utils/global';
import fs from 'fs';
import assert from 'assert';
import chance from 'chance';
import {
  cloneDeep as lodash_cloneDeep,
  pull as lodash_pull,
  intersection as lodash_intersection,
} from 'lodash';
import { ASTNode, ASTNodeTypeString } from 'solidity-parser-antlr';
import { DeepReadonly } from 'ts-essentials';
import { RandomASTNodeSpace } from './ASTNodeSpace';
import {
  allMutationTypes,
  DeletionM,
  InsertionM,
  MovementM,
  Mutation,
  ReplacementM,
} from './Mutations';
import { getASTNodeFromPath } from './utils';


type MutationDistance = number;
type SerializedAST = Opaque<string, 'SerializedAST'>;

export enum RandomMutationGenerator_addKnownAST_Result {
  SUCCESS,
  ALREADY_SEEN_AST,
  ALREADY_SEEN_BIN,
  NOT_COMPILABLE,
}

const debugLogger_newMutant = debug('newMutant');
const debugLogger_newMutant_newMutation = debugLogger_newMutant.extend('newMutation');
const debugLogger_newMutant_newMutation_modifiedNodes = debugLogger_newMutant_newMutation.extend('modifiedNodes');
const debugLogger_newMutant_newFaultSpace = debugLogger_newMutant.extend('faultSpace');
const debugLogger_newMutant_mutSeq = debugLogger_newMutant.extend('mutSeq');
const debugLogger_newMutant_baseSeq = debugLogger_newMutant.extend('baseSeq');
const debugLogger_newMutant_bfAST = debugLogger_newMutant.extend('bfAST');
const debugLogger_newMutant_bfAST_faultSpace = debugLogger_newMutant_bfAST.extend('faultSpace');
const debugLogger_newMutant_aftAST = debugLogger_newMutant.extend('aftAST');
const debugLogger_newMutant_status = debugLogger_newMutant.extend('status');
const debugLogger_newMutant_status_sameAST = debugLogger_newMutant_status.extend('sameAST');
const debugLogger_newMutant_status_sameBin = debugLogger_newMutant_status.extend('sameBin');
const debugLogger_newMutant_status_non_compilable = debugLogger_newMutant_status.extend('non-compilable');

export enum RandomMutationGenerator_Result {
  ExhaustedForRequestedAST = 'ExhaustedForRequestedAST',
  TerminateRequested = 'TerminateRequested',
}

export interface FaultSpaceInfo {
  faultSpace: DeepReadonly<FaultSpace>;
  remainingMutation: DeepReadonly<typeof allMutationTypes>;
}

export function faultSpaceToFaultSpaceInfo(faultSpace: DeepReadonly<FaultSpace>, possibleMutationTypes: typeof allMutationTypes): Merge<FaultSpaceInfo, { faultSpace: DeepReadonly<FaultSpace> }> {
  return {
    faultSpace: faultSpace,
    remainingMutation: lodash_cloneDeep(possibleMutationTypes)
  }
}

export default class RandomMutationSequenceGenerator {

  private readonly bins: Set<string> = new Set(); // This is unused if skip_same_bin == false

  // Note: ASTs that can't be base will be removed from this Map
  private readonly dist_ast_infoMap: Map<
    MutationDistance,
    Map<
      SerializedAST,
      {
        readonly faultspaceInfo: DeepReadonly<FaultSpaceInfo[]>;
        readonly mutationGen: RandomMutationGenerator;
        readonly mutationSeq: MutationSequence;
      }
    >
  > = new Map();

  // Note: All seen ASTs are here
  public readonly ast_DistMap: Map<SerializedAST, number> = new Map();
  private readonly rng: Chance.Chance;

  private readonly faultSpaceInfo_oriAST: DeepReadonly<FaultSpaceInfo[]>;

  constructor(
    private readonly oriAST: DeepReadonly<ASTNode>,
    public readonly minDistance: number = 1,
    public readonly maxDistance: number = Infinity,
    faultSpace_oriAST_: DeepReadonly<FaultSpace[]>,
    private readonly possibleMutationTypes: DeepReadonly<typeof allMutationTypes> = allMutationTypes,
    private readonly newNodeTypeSpace: ASTNodeTypeString[] | undefined = undefined,
    private readonly must_include_mutation_types: DeepReadonly<typeof allMutationTypes> | undefined = undefined,
    private readonly replaceableNodeType: ASTNodeTypeString[] | undefined = undefined,
    public readonly only_compilable: boolean = true,
    public readonly skip_same_bin: boolean = true,
    public readonly _mutate_mutated_location: boolean = false,
    seed?: Seed,
  ) {

    if (faultSpace_oriAST_.length === 0) {
      logger.warn('The initial fault space is empty! Nothing can be further done.');
    }

    assert(must_include_mutation_types === undefined || must_include_mutation_types.every((type) => possibleMutationTypes.includes(type)), 'Some of must include mutation types are not in possible mutation types!');

    this.rng = seed === undefined ? new chance() : new chance(seed);
    this.faultSpaceInfo_oriAST = faultSpace_oriAST_.map((x) => faultSpaceToFaultSpaceInfo(x, possibleMutationTypes));
    const addOriASTRst = this.addKnownAST(oriAST, new MutationSequence(), this.faultSpaceInfo_oriAST);
    assert(addOriASTRst === RandomMutationGenerator_addKnownAST_Result.SUCCESS);
  }

  public next<T extends DeepReadonly<ASTNode>>(request: { requestAST?: T, overriddenFaultSpace?: T extends DeepReadonly<ASTNode> ? (DeepReadonly<FaultSpace[]> | undefined) : undefined, allowedMutationTypes?: typeof allMutationTypes } = { requestAST: undefined, overriddenFaultSpace: undefined, allowedMutationTypes: undefined }): IteratorResult<MutationSequence | RandomMutationGenerator_Result | undefined> {

    const { requestAST, overriddenFaultSpace, allowedMutationTypes } = request;

    // Can only override fault space when there's AST requested
    assert(overriddenFaultSpace === undefined || requestAST !== undefined);

    while (true) {

      // await util.promisify(process.nextTick)();

      if(g.terminateNow || fs.existsSync(`/tmp/terminate_all`) ) {
        return {value: RandomMutationGenerator_Result.TerminateRequested, done: false};
      }

      const specifiedAST = requestAST !== undefined;
      let serializedAST, mutationGen, baseMutationSeq;

      let infoMap: ReturnType<NonNullable<ReturnType<RandomMutationSequenceGenerator['dist_ast_infoMap']['get']>>['get']>;

      let ast = requestAST;

      if (ast === undefined) {
        // Base AST not specified, randomly pick one
        const pickableAst_infoMap = Array.from(this.dist_ast_infoMap.entries())
          .filter(([dist, map]) => dist < this.maxDistance && map.size > 0)
          .map(([, map]) => map);

        if (pickableAst_infoMap.length === 0) {
          // All possible ASTs within range are already seen
          return {
            value: undefined,
            done: true,
          };
        }

        const ast_infoMap = this.rng.pickone(pickableAst_infoMap);
        const pickableSerializedASTs = Array.from(ast_infoMap.keys());
        assert(pickableSerializedASTs.length >= 1);
        serializedAST = this.rng.pickone(pickableSerializedASTs);
        ast = JSON.parse(serializedAST);
        const infoMap_ = ast_infoMap.get(serializedAST);
        assert(infoMap_ !== undefined, `Can't get infoMap for ${serializedAST} while it was from keys`);
        infoMap = infoMap_!;

      } else {
        
        serializedAST = JSON.stringify(ast) as SerializedAST;
        const dist = this.ast_DistMap.get(serializedAST);
        assert(dist !== undefined, `Requested base AST not found in this class`);
        assert(
          dist! < this.maxDistance,
          "Requested base AST is already at max distance, can't generate more ASTs based on it.",
        );
        // assert(this.dist_ast_infoMap.has(dist!), `dist ${dist} retrieved from ast_DistMap is not in dist_ast_infoMap! dist_ast_infoMap available keys: ${[...this.dist_ast_infoMap.keys()]}`);

        if (dist === this.maxDistance) {
          // The requested AST can't be modified further
          return {
            value: RandomMutationGenerator_Result.ExhaustedForRequestedAST,
            done: false,
          };
        }

        const ast_infoMap = this.dist_ast_infoMap.get(dist!);

        if (ast_infoMap === undefined) {
          // The requested AST can't be modified further
          return {
            value: RandomMutationGenerator_Result.ExhaustedForRequestedAST,
            done: false,
          };
        }


        infoMap = ast_infoMap.get(serializedAST);

        if (infoMap === undefined) {
          // The requested AST can't be modified further
          return {
            value: RandomMutationGenerator_Result.ExhaustedForRequestedAST,
            done: false,
          };
        }
      }

      const infoMap_ = infoMap!;
      mutationGen = infoMap_.mutationGen;

      const original_faultSpace_Path = infoMap_.faultspaceInfo;

      baseMutationSeq = infoMap_.mutationSeq;

      assert(serializedAST !== undefined);
      assert(ast !== undefined);
      assert(mutationGen !== undefined);
      assert(baseMutationSeq !== undefined);

      // Generate one mutation
      const newMutation = mutationGen.next({ allowedMutationTypes, overriddenFaultSpace }).value;

      if (newMutation === undefined) {
        // Search space is already exhausted for current ast
        assert(this.ast_DistMap.has(serializedAST));
        const ast_infoMap = this.dist_ast_infoMap.get(baseMutationSeq.length);
        assert(ast_infoMap !== undefined);
        ast_infoMap!.delete(serializedAST);

        if (specifiedAST) {
          if (this.isAllASTDone()) {
            return {
              value: undefined,
              done: true,
            };
          } else {
            return {
              value: RandomMutationGenerator_Result.ExhaustedForRequestedAST,
              done: false,
            };
          }
        } else {
          continue;
        }
      } else if (newMutation === addNewMutation_random_Result.RequestNotFulfilled) {
        // Better handling this
        return {
          value: RandomMutationGenerator_Result.ExhaustedForRequestedAST,
          done: false,
        };
      }

      const beforeAST = ast!;

      debugLogger_newMutant_newMutation(newMutation);

      debugLogger_newMutant_baseSeq(baseMutationSeq);
      debugLogger_newMutant_bfAST(beforeAST);
      debugLogger_newMutant_bfAST_faultSpace(original_faultSpace_Path);

      debugLogger_newMutant_newMutation_modifiedNodes(newMutation.modifiedLocations(beforeAST));

      const newAST = lodash_cloneDeep(beforeAST) as ASTNode;
      // Update AST and faultSpace
      newMutation.apply(newAST);

      debugLogger_newMutant_aftAST(newAST);

      const new_faultSpace_Path_ = original_faultSpace_Path
        .map(x => {
          const newNodePath = newMutation.updateASTPath.bind(newMutation, beforeAST)(x.faultSpace.nodePath);
          if (newNodePath === null) {
            return null;
          } else if (lodash_equal(x!.faultSpace.nodePath, newMutation.targetNodePath)) {
            const mutationType = newMutation.mutationType;
            assert(x!.remainingMutation.includes(mutationType), `New mutation of type \`${mutationType}\`is not in original remaining mutation array!${os.EOL}remainingMutation = ${util.inspect(x!.remainingMutation, false, Infinity, true)}`);
            const newRemainingMutation = lodash_without(x!.remainingMutation, mutationType);
            if (newRemainingMutation.length !== 0) {
              return { faultSpace: { nodePath: newNodePath }, remainingMutation: newRemainingMutation };
            } else {
              return null;
            }
          } else {
            return { faultSpace: { nodePath: newNodePath }, remainingMutation: x.remainingMutation };
          }
        })
        .filter(x => x !== null);

      const new_faultSpaceInfo_Path = new_faultSpace_Path_ as (typeof new_faultSpace_Path_) extends (infer T)[] ? (Exclude<T, null>)[] : never;

      debugLogger_newMutant_newFaultSpace(new_faultSpaceInfo_Path);

      const newMutationSeq = new MutationSequence(...[...baseMutationSeq, newMutation]);

      debugLogger_newMutant_mutSeq(newMutationSeq);

      const addASTRst = this.addKnownAST(newAST, newMutationSeq, new_faultSpaceInfo_Path);
      switch (addASTRst) {
        case RandomMutationGenerator_addKnownAST_Result.ALREADY_SEEN_AST:
        case RandomMutationGenerator_addKnownAST_Result.ALREADY_SEEN_BIN:
        case RandomMutationGenerator_addKnownAST_Result.NOT_COMPILABLE: {
          continue;
        }
        case RandomMutationGenerator_addKnownAST_Result.SUCCESS: {
          let pass_must_include_types_check: boolean = true;

          if (this.must_include_mutation_types !== undefined) {
            const types = lodash_uniq(newMutationSeq.map((x) => x.mutationType));
            pass_must_include_types_check = this.must_include_mutation_types.every((x) => types.includes(x));
          }

          if (pass_must_include_types_check) {
            return {
              value: newMutationSeq,
              done: false,
            };
          } else {
            continue;
          }
        }

      }
    }
  }

  public simplifyAST(ast_: DeepReadonly<ASTNode>) {

    const simplificationMutationSeqs: MutationSequence[] = [];

    const visitor: { readonly [k in keyof Visitor]: (node: Parameters<NonNullable<Visitor[k]>>[0], path: NodePath) => any } = {
      IfStatement(node, path) {

        function isBodyEmpty(body: Statement | null) {
          return body === null || (body.type === 'Block' && body.statements.length === 0);
        }

        if (isBodyEmpty(node.trueBody) && isBodyEmpty(node.falseBody)) {
          // The condition might have side-effect, can't simply remove it
          simplificationMutationSeqs.push(new MutationSequence(...[new ReplacementM(path, node.condition)]));
        }
      }
    };

    visitWithPath(ast_, visitor);

    const simplificationMutationSeqs_dists = simplificationMutationSeqs.map((x) => x.length);
    const idxLongestSimplificationSeq = simplificationMutationSeqs_dists.indexOf(Math.max(...simplificationMutationSeqs_dists));
    const simplifiedAST = simplificationMutationSeqs.map((mutationSeq) => mutationSeq.mutateAST(lodash_cloneDeep(ast_) as ASTNode));

    for (const dupAST of simplifiedAST) {
      const serializedDupAST = JSON.stringify(dupAST) as SerializedAST;
      this.ast_DistMap.set(serializedDupAST, Infinity);
    }

    return simplifiedAST[idxLongestSimplificationSeq];
  }

  public addKnownAST(
    ast_: DeepReadonly<ASTNode>,
    mutationSequence: MutationSequence,
    new_faultSpace__?: DeepReadonly<FaultSpace[]> | DeepReadonly<(FaultSpaceInfo)[]>,
  ): RandomMutationGenerator_addKnownAST_Result {

    // TODO: fix typing
    let new_faultSpaceInfo_ = new_faultSpace__ as DeepReadonly<(FaultSpaceInfo)[]>;
    if (new_faultSpace__ !== undefined && new_faultSpace__.length !== 0 && (new_faultSpace__[0] as any)['remainingMutation'] === undefined) {
      new_faultSpaceInfo_ = (new_faultSpace__ as DeepReadonly<FaultSpace[]>).map((x) => faultSpaceToFaultSpaceInfo(x, this.possibleMutationTypes));
    }

    const ASTCopy_: ASTNode = lodash_cloneDeep(ast_) as ASTNode;
    ASTNodeRemoveExtraAttributesDeep(ASTCopy_);
    const ASTCopy = ASTCopy_ as DeepReadonly<ASTNode>;

    const serializedNewAST = JSON.stringify(ASTCopy) as SerializedAST;

    if (this.ast_DistMap.has(serializedNewAST)) {
      // The created AST has found before, trying another one
      debugLogger_newMutant_status_sameAST('Seen AST found!');
      return RandomMutationGenerator_addKnownAST_Result.ALREADY_SEEN_AST;
    }

    // Now confirms the newAST has never seen before

    const newDist = mutationSequence.length;
    this.ast_DistMap.set(serializedNewAST, newDist);

    if (newDist < this.maxDistance) {

      let new_faultSpaceInfo_Path: typeof new_faultSpaceInfo_;
      if ((new_faultSpaceInfo_Path = new_faultSpaceInfo_) === undefined) {
        new_faultSpaceInfo_Path = lodash_zip(
          mutationSequence.updatePath_oriAST(
            this.oriAST,
            this.faultSpaceInfo_oriAST.map((x) => getFaultSpaceNodePath(x.faultSpace)),
          ), this.faultSpaceInfo_oriAST.map((x) => {
            return { remainingMutation: x.remainingMutation }
          })
        )
          .filter((x) => x[0] !== null).map((([nodePath, x]) => {
            return { faultSpace: { nodePath: nodePath as any }, remainingMutation: (x as any).remainingMutation as FaultSpaceInfo['remainingMutation'] }
          }));
      }

      if (new_faultSpaceInfo_Path.length !== 0) {

        let ast_infoMap: ReturnType<RandomMutationSequenceGenerator['dist_ast_infoMap']['get']>;
        if ((ast_infoMap = this.dist_ast_infoMap.get(newDist)) === undefined) {
          ast_infoMap = new Map();
          this.dist_ast_infoMap.set(newDist, ast_infoMap);
        }

        assert(!ast_infoMap.has(serializedNewAST));
        ast_infoMap.set(serializedNewAST, {
          mutationGen: new RandomMutationGenerator(
            ASTCopy,
            new_faultSpaceInfo_Path!,
            this.possibleMutationTypes,
            this.newNodeTypeSpace,
            this.replaceableNodeType,
            this.rng.integer(),
          ),
          mutationSeq: mutationSequence,
          faultspaceInfo: new_faultSpaceInfo_Path!,
        });
      } else {
        // No space for further mutation, won't be considered as base for further mutation
      }
    }

    if (this.only_compilable) {
      const compileOut = compile(a2S(ASTCopy), true, this.skip_same_bin);
      if (compileOut !== false) {
        if (this.skip_same_bin) {
          const bins_without_swarm = lodash_mapValues(compileOut as Exclude<typeof compileOut, true>, (bin: string) => stripSwarmMetadata(bin));
          // const bins_without_swarm = compileOut;
          // TODO: A more efficient but safe serialization
          const serializedCompileOut = JSON.stringify(bins_without_swarm);
          if (this.bins.has(serializedCompileOut)) {
            debugLogger_newMutant_status_sameBin('Same bin found');
            return RandomMutationGenerator_addKnownAST_Result.ALREADY_SEEN_BIN;
          } else {
            this.bins.add(serializedCompileOut);
          }
        }
      } else {
        // Not compilable
        debugLogger_newMutant_status_non_compilable('Not compilable');
        return RandomMutationGenerator_addKnownAST_Result.NOT_COMPILABLE;
      }
    }

    return RandomMutationGenerator_addKnownAST_Result.SUCCESS;
  }

  public isAllASTDone() {
    return !Array.from(this.dist_ast_infoMap.entries()).some(([dist, map]) => dist < this.maxDistance && map.size > 0);
  }

  public findASTByMutationSequence(mutationSequence: MutationSequence, ): DeepReadonly<ASTNode> | undefined {
    const dist = mutationSequence.length;

    const ast_infoMap = this.dist_ast_infoMap.get(dist);
    if (ast_infoMap === undefined) {
      return undefined;
    }

    for (const [serializedAST, info] of ast_infoMap.entries()) {
      if (lodash_equal(info.mutationSeq, mutationSequence)) {
        return JSON.parse(serializedAST);
      }
    }

    return undefined;
  }

  // public numMutantRemaining(): number {
  //   const cloneGen = lodash_cloneDeep(this);
  //   let count: number = 0;
  //   for (const _ of cloneGen) {
  //     count++;
  //   }

  //   return count;
  // }

  [Symbol.iterator]() {
    return this;
  }
}

function getFaultSpaceInfoNodePair(ast: DeepReadonly<ASTNode>, faultSpace: DeepReadonly<FaultSpaceInfo[]>): [DeepReadonly<FaultSpaceInfo>, ASTNode][] {
  return faultSpace.map(x => {
    const node: ASTNode = getASTNodeFromPath(ast, x.faultSpace.nodePath);
    assert(node !== undefined, `FaultSpace ${util.inspect(x, false, Infinity, true)} not found in AST`);

    return [x, node];
  })
}

export enum addNewMutation_random_Result {
  RequestNotFulfilled
}

export class RandomMutationGenerator implements IterableIterator<Mutation | addNewMutation_random_Result | undefined> {
  /*

For generating one `Mutation` for one given AST. 
For one unique mutation, this generator will only generate once.

faultSpace: node paths of potentially fault nodes

*/

  private readonly possibleMutationTypes: DeepReadonly<typeof allMutationTypes>;
  private readonly insertionM_Gen: ReturnType<typeof InsertionM['randomGenerator']>;
  private readonly replacementM_Gen: ReturnType<typeof ReplacementM['randomGenerator']>;
  private readonly deletionM_Gen: ReturnType<typeof DeletionM['randomGenerator']>;
  private readonly movementM_Gen: ReturnType<typeof MovementM['randomGenerator']>;
  private readonly rng: Chance.Chance;

  public constructor(ast_: DeepReadonly<ASTNode>,
    faultSpaceInfo_: DeepReadonly<FaultSpaceInfo[]>,
    possibleMutationTypes_: DeepReadonly<typeof allMutationTypes> = allMutationTypes,
    newNodeTypeSpace: ASTNodeTypeString[] | undefined = undefined,
    replaceableNodeType: ASTNodeTypeString[] | undefined = undefined,
    seed?: Seed) {

    const ast = lodash_cloneDeep(ast_);
    const faultSpaceInfo = lodash_cloneDeep(faultSpaceInfo_);

    assert(faultSpaceInfo.length !== 0);
    assert(possibleMutationTypes_.length !== 0);

    this.possibleMutationTypes = lodash_cloneDeep(possibleMutationTypes_);

    this.rng = seed === undefined ? new chance() : new chance(seed);

    const astNodeSpace = new RandomASTNodeSpace(ast);

    const faultSpaceInfo_Node: Array<[DeepReadonly<FaultSpaceInfo>, ASTNode]> = getFaultSpaceInfoNodePair(ast, faultSpaceInfo);

    const faultSpaces_insertionMutation: DeepReadonly<FaultSpace[]> = faultSpaceInfo_Node.filter((x) => x[0].remainingMutation.includes(InsertionM.name)).map((x) => x[0].faultSpace);
    this.insertionM_Gen = InsertionM.randomGenerator(
      ast,
      faultSpaces_insertionMutation,
      astNodeSpace,
      ['ExpressionStatement'],
      this.rng,
    );

    this.replacementM_Gen = ReplacementM.randomGenerator(
      ast,
      faultSpaceInfo_Node.filter((x) => x[0].remainingMutation.includes(ReplacementM.name)).map((x) => x[0].faultSpace),
      astNodeSpace,
      replaceableNodeType === undefined ? astNodeSpace.supportedNodeTypes : replaceableNodeType,
      newNodeTypeSpace === undefined ? astNodeSpace.supportedNodeTypes : newNodeTypeSpace,
      this.rng,
    );
    this.deletionM_Gen = DeletionM.randomGenerator(ast, faultSpaceInfo.filter((x) => x.remainingMutation.includes(DeletionM.name)).map((x) => x.faultSpace), this.rng);
    this.movementM_Gen = MovementM.randomGenerator(
      ast,
      faultSpaceInfo.filter((x) => x.remainingMutation.includes(MovementM.name)).map((x) => x.faultSpace),
      true,
      this.rng,
    );

  }

  public next(request: { readonly allowedMutationTypes?: typeof allMutationTypes, readonly overriddenFaultSpace?: DeepReadonly<FaultSpace[]> } = { allowedMutationTypes: undefined, overriddenFaultSpace: undefined }) {
    while (true) {
      if (this.possibleMutationTypes.length === 0) {
        // no mutataion possible
        return { value: undefined, done: true };
      }

      const { allowedMutationTypes, overriddenFaultSpace } = request;

      const possibleMutationTypes_ = allowedMutationTypes !== undefined ? lodash_intersection(this.possibleMutationTypes, allowedMutationTypes) : this.possibleMutationTypes;
      if (possibleMutationTypes_.length === 0) {
        return { value: addNewMutation_random_Result.RequestNotFulfilled, done: false };
      }

      const newMutationType = this.rng.pickone(possibleMutationTypes_ as string[]);
      assert(typeof newMutationType !== 'undefined');

      const genNameMap = {
        [InsertionM.name]: this.insertionM_Gen,
        [ReplacementM.name]: this.replacementM_Gen,
        [DeletionM.name]: this.deletionM_Gen,
        [MovementM.name]: this.movementM_Gen,
      };

      const chosenMutationGen = genNameMap[newMutationType];
      if (overriddenFaultSpace !== undefined) {
        // Make this logic more generic
        assert(chosenMutationGen.updateFaultSpace({
          updateType: 'intersect',
          faultSpaces: overriddenFaultSpace
        }));
      }

      const newMutation = chosenMutationGen.next().value;

      if (newMutation === undefined) {
        lodash_pull(this.possibleMutationTypes, newMutationType);
        continue;
      }

      return { value: newMutation, done: false };

    }
  }

  public isMutationInRemainingSpace(mutation: DeepReadonly<Mutation>) {

    if (!this.possibleMutationTypes.includes(mutation.mutationType)) {
      return false;
    }

    switch (mutation.mutationType) {
      case InsertionM.name: {
        return this.insertionM_Gen.isMutationInRemainingSpace(mutation as InsertionM);
      }
      case ReplacementM.name: {
        return this.replacementM_Gen.isMutationInRemainingSpace(mutation as ReplacementM);
      }
      case MovementM.name: {
        return this.movementM_Gen.isMutationInRemainingSpace(mutation as MovementM);
      }
      case DeletionM.name: {
        return this.deletionM_Gen.isMutationInRemainingSpace(mutation as DeletionM);
      }
      default: {
        throw new UnimplementedError();
      }
    }
  }

  [Symbol.iterator]() {
    return this;
  }
}
