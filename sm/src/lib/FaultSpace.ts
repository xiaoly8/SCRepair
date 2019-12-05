/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import { NodePath, getASTNodeFromPath } from "./utils";
import { DeepReadonly } from "ts-essentials";
import { ASTNode } from "solidity-parser-antlr";
import assert from 'assert';
import util from 'util';

export default interface FaultSpace {
    nodePath: NodePath;
}

export function getFaultSpaceNodePath(faultSpace: DeepReadonly<FaultSpace>): typeof faultSpace['nodePath'] {
    return faultSpace.nodePath;
}

export function getFaultSpaceNodePair(ast: DeepReadonly<ASTNode>, faultSpace: DeepReadonly<FaultSpace[]>): [DeepReadonly<FaultSpace>, ASTNode][] {
    return faultSpace.map(x => {
        const node: ASTNode = getASTNodeFromPath(ast, x.nodePath);
        assert(node !== undefined, `FaultSpace ${util.inspect(x, false, Infinity, true)} not found in AST`);

        return [x, node];
    })
}
