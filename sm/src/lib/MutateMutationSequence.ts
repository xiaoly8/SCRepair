/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import is from '@sindresorhus/is';
import assert from 'assert';
import { cloneDeep as lodash_cloneDeep } from 'lodash';
import { ASTNode } from 'solidity-parser-antlr';
import { DeepReadonly } from 'ts-essentials';
import MutationSequence from './MutationSequence';


export function MutateMutationSequence_Crossover_OnePoint(
  oriAST: DeepReadonly<ASTNode>,
  mutationSeq1_: MutationSequence,
  mutationSeq2_: MutationSequence,
  crosspoint1: number,
  crosspoint2: number,
): MutationSequence[] {
  assert(crosspoint1 >= -1 && crosspoint1 < mutationSeq1_.length);
  assert(crosspoint2 >= -1 && crosspoint2 < mutationSeq2_.length);

  const mutationSeq1__ = lodash_cloneDeep(mutationSeq1_) as typeof mutationSeq1_;
  const mutationSeq2__ = lodash_cloneDeep(mutationSeq2_) as typeof mutationSeq2_;

  const mutationSeq1_fst = mutationSeq1__.splice(0, crosspoint1 + 1);
  const mutationSeq1_snd = mutationSeq1__;

  const mutationSeq2_fst = mutationSeq2__.splice(0, crosspoint2 + 1);
  const mutationSeq2_snd = mutationSeq2__;

  const prevASTs1 = mutationSeq1_.reduce(
    (asts, mutation, idx) => {
      const newAST = lodash_cloneDeep(asts[idx]) as ASTNode;
      mutation.apply(newAST);
      asts.push(newAST);

      return asts;
    },
    [oriAST],
  );

  const prevASTs2 = mutationSeq2_.reduce(
    (asts, mutation, idx) => {
      const newAST = lodash_cloneDeep(asts[idx]) as ASTNode;
      mutation.apply(newAST);
      asts.push(newAST);

      return asts;
    },
    [oriAST],
  );

  let adapted_mutationSeq1_snd: MutationSequence | undefined;
  {
    const mutationSeq1_snd_aftAST: DeepReadonly<ASTNode>[] = prevASTs2.slice(1, mutationSeq2_fst.length + 1);
    assert(mutationSeq1_snd_aftAST.length === mutationSeq2_fst.length);
    adapted_mutationSeq1_snd = mutationSeq1_snd.reduce((newArr: MutationSequence | undefined, x, idx) => {

      if (newArr === undefined) {
        return undefined;
      }

      const newX = x.rebase(oriAST, new MutationSequence(...[...mutationSeq1_fst, ...mutationSeq1_snd.slice(0, idx)]), prevASTs1.slice(0, mutationSeq1_fst.length + idx), new MutationSequence(...[...mutationSeq2_fst, ...newArr]), mutationSeq1_snd_aftAST);

      if (newX === undefined) {
        return undefined;
      }

      const ASTRightBeforeNewX_idx = mutationSeq2_fst.length - 1 + idx;
      const ASTRightBeforeNewX = ASTRightBeforeNewX_idx === -1 ? oriAST : mutationSeq1_snd_aftAST[ASTRightBeforeNewX_idx];
      const newAST = lodash_cloneDeep(ASTRightBeforeNewX) as ASTNode;
      newX.apply(newAST);

      mutationSeq1_snd_aftAST.push(newAST);
      newArr.push(newX);
      return newArr;
    }, new MutationSequence());
  }

  let adapted_mutationSeq2_snd: MutationSequence | undefined;
  {
    const mutationSeq2_snd_aftAST: DeepReadonly<ASTNode>[] = prevASTs1.slice(1, mutationSeq1_fst.length + 1);
    assert(mutationSeq2_snd_aftAST.length === mutationSeq1_fst.length);
    adapted_mutationSeq2_snd = mutationSeq2_snd.reduce((newArr: MutationSequence | undefined, x, idx) => {

      if (newArr === undefined) {
        return undefined;
      }

      const newX = x.rebase(oriAST, new MutationSequence(...[...mutationSeq2_fst, ...mutationSeq2_snd.slice(0, idx)]), prevASTs2.slice(0, mutationSeq2_fst.length + idx), new MutationSequence(...[...mutationSeq1_fst, ...newArr]), mutationSeq2_snd_aftAST);

      if (newX === undefined) {
        return undefined;
      }

      const ASTRightBeforeNewX_idx = mutationSeq1_fst.length - 1 + idx;
      const ASTRightBeforeNewX = ASTRightBeforeNewX_idx === -1 ? oriAST : mutationSeq2_snd_aftAST[ASTRightBeforeNewX_idx];
      const newAST = lodash_cloneDeep(ASTRightBeforeNewX) as ASTNode;
      newX.apply(newAST);

      mutationSeq2_snd_aftAST.push(newAST);
      newArr.push(newX);
      return newArr;
    }, new MutationSequence());
  }


  const newSeq1 = adapted_mutationSeq2_snd !== undefined
    ? ([...mutationSeq1_fst, ...adapted_mutationSeq2_snd] as MutationSequence)
    : undefined;
  const newSeq2 = adapted_mutationSeq1_snd !== undefined
    ? ([...mutationSeq2_fst, ...adapted_mutationSeq1_snd] as MutationSequence)
    : undefined;

  return [newSeq1, newSeq2].filter(seq => !is.undefined(seq)) as MutationSequence[];
}
