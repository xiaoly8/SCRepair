/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import { at as lodash_at } from 'lodash';
import parser from 'prettier-plugin-solidity/src/parser';
import { ASTNode } from 'solidity-parser-antlr';
import util from 'util';
import { a2S } from '../utils/SRCUtils';
import MutationSequence from './MutationSequence';

export function mutateSrc(str_src: string, mutations: MutationSequence): string {
  return mutateFromAST(parser(str_src), mutations);
}

export function mutateFromAST(ast: ASTNode, mutations: MutationSequence): string {
  try {
    return a2S(mutations.mutateAST(ast));
  } catch (e) {
    console.error(`Mutated AST = \n${util.inspect(mutations.mutateAST(ast), true, Infinity, true)}`);
    console.error(`Mutations = \n${util.inspect(mutations, true, Infinity, true)}`);
    console.error(
      `Target nodes =\n${util.inspect(
        (lodash_at as any)(ast, mutations.map(m => m.targetNodePath)),
        true,
        Infinity,
        true,
      )}`,
    );
    throw e;
  }
}
