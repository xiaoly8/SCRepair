/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import { DeepReadonly, Opaque } from "ts-essentials";
import { ASTNode } from "solidity-parser-antlr";
import { NodePath, ScopeInfo, objPathVisit, isASTNode } from ".";

export function getNodePathScopeInfo(ast: DeepReadonly<ASTNode>, nodePath: DeepReadonly<NodePath>): ScopeInfo {

    let contractName: undefined | string = undefined;
    let functionName: undefined | null | string = undefined;
  
    objPathVisit(ast as any, nodePath, (node) => {
  
      if (isASTNode(node)) {
        switch (node.type) {
          case 'ContractDefinition': {
            contractName = node.name;
            return true;
          }
  
          case 'FunctionDefinition': {
            functionName = node.name;
  
            // All wanted info has been found, stop visiting further
            return false;
          }
        }
      }
  
      return true;
  
    });
  
    return {
      contractName,
      functionName,
    };
  }

export type NodePath_Stringified = Opaque<string, 'NodePath'>;