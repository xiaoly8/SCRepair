/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */

import { CodeRange, ASTNode, ASTNodeTypeString } from "solidity-parser-antlr";
import locInclude from "../LocInclude";
import { NodePath, objPathVisit, locationIntersect, isASTNode } from "../utils";
import assert from 'assert';
import { DeepReadonly } from "ts-essentials";

class EarlyExitFromVIsitorException { }

export abstract class InterestedSpace {
    constructor() {

    }

    public abstract isNodeInterested(astNode: DeepReadonly<ASTNode>, nodePath: DeepReadonly<NodePath>, wholeFileAST: DeepReadonly<ASTNode>): boolean;
    public isNodeInExactScope(astNode: DeepReadonly<ASTNode>, nodePath: DeepReadonly<NodePath>, wholeFileAST: DeepReadonly<ASTNode>): boolean {
        return this.isNodeInterested(astNode, nodePath, wholeFileAST);
    }
}

export class ConjunctInterestedSpace extends InterestedSpace {

    public readonly interestedSpaces: readonly InterestedSpace[]
    
    public constructor(...interestedSpaces: readonly InterestedSpace[]) {
        super()

        this.interestedSpaces = interestedSpaces;
    }

    public isNodeInterested(astNode: DeepReadonly<ASTNode>, nodePath: DeepReadonly<NodePath>, wholeFileAST: DeepReadonly<ASTNode>): boolean {
        return this.interestedSpaces.every((x)=>x.isNodeInterested(astNode, nodePath, wholeFileAST));
    }

    public isNodeInExactScope(astNode: DeepReadonly<ASTNode>, nodePath: DeepReadonly<NodePath>, wholeFileAST: DeepReadonly<ASTNode>): boolean {
        return this.interestedSpaces.every((x)=>x.isNodeInExactScope(astNode, nodePath, wholeFileAST));
    }    
}

export class InterestedLocation extends InterestedSpace {
    constructor(public readonly location: CodeRange) {
        super();
    }

    public isNodeInterested(astNode: DeepReadonly<ASTNode>, _nodePath: DeepReadonly<NodePath>, _wholeFileAST: DeepReadonly<ASTNode>): boolean {
        return astNode.loc !== undefined && locationIntersect(astNode.loc, this.location);
    }

    public isNodeInExactScope(astNode: DeepReadonly<ASTNode>, _nodePath: DeepReadonly<NodePath>, _wholeFileAST: DeepReadonly<ASTNode>): boolean {
        return astNode.loc !== undefined && locInclude(astNode.loc!, this.location);
    }
}

export class InterestedNodeType extends InterestedSpace {
    constructor(public readonly nodeType: ASTNodeTypeString) {
        super();
    }

    public isNodeInterested(astNode: DeepReadonly<ASTNode>, _nodePath: DeepReadonly<NodePath>, _wholeFileAST: DeepReadonly<ASTNode>): boolean {
        return isASTNode(astNode);
    }

    public isNodeInExactScope(astNode: DeepReadonly<ASTNode>, _nodePath: DeepReadonly<NodePath>, _wholeFileAST: DeepReadonly<ASTNode>): boolean {
        return astNode.type === this.nodeType;
    }
}

export class InterestedContract extends InterestedSpace {

    constructor(public readonly contractName: string, public functionNames: string[] | null) {
        super();

        assert(!Array.isArray(this.functionNames) || functionNames!.length !== 0);
    }

    public isNodeInterested(_astNode: DeepReadonly<ASTNode>, nodePath: DeepReadonly<NodePath>, wholeFileAST: DeepReadonly<ASTNode>): boolean {

        let rst: boolean = true;

        const thisInstance = this;

        function visitPath(node: DeepReadonly<ASTNode>): boolean {
            switch (node.type) {
                case 'ContractDefinition': {
                    if (thisInstance.contractName !== node.name) {
                        rst = false;
                        throw new EarlyExitFromVIsitorException();
                    } else if (thisInstance.contractName === node.name && thisInstance.functionNames === null) {
                        rst = true;
                        throw new EarlyExitFromVIsitorException();
                    } else {
                        assert(thisInstance.contractName === node.name && Array.isArray(thisInstance.functionNames));
                        // Note: Comment the following to make only statements in a function interested
                        rst = true;
                        return true;
                    }

                    // break;
                }

                case 'FunctionDefinition': {
                    assert(Array.isArray(thisInstance.functionNames));

                    rst = (thisInstance.functionNames!.includes(node.name))
                    throw new EarlyExitFromVIsitorException();
                }

                default: {
                    return true;
                }
            }
        };

        try {
            objPathVisit(wholeFileAST as any, nodePath as any, visitPath);
        } catch (EarlyExitFromVIsitorException) { }

        return rst;
    }

    public isNodeInExactScope(_astNode: DeepReadonly<ASTNode>, nodePath: DeepReadonly<NodePath>, wholeFileAST: DeepReadonly<ASTNode>): boolean {

        let rst: boolean = true;

        const thisInstance = this;

        function visitPath(node: DeepReadonly<ASTNode>): boolean {
            switch (node.type) {
                case 'ContractDefinition': {
                    if (thisInstance.contractName !== node.name) {
                        rst = false;
                        throw new EarlyExitFromVIsitorException();
                    } else if (thisInstance.contractName === node.name && thisInstance.functionNames === null) {
                        rst = true;
                        throw new EarlyExitFromVIsitorException();
                    } else {
                        assert(thisInstance.contractName === node.name && Array.isArray(thisInstance.functionNames));
                        rst = false;
                        return true;
                    }

                    // break;
                }

                case 'FunctionDefinition': {
                    assert(Array.isArray(thisInstance.functionNames));

                    rst = (thisInstance.functionNames!.includes(node.name))
                    throw new EarlyExitFromVIsitorException();
                }

                default: {
                    return true;
                }
            }
        };

        try {
            objPathVisit(wholeFileAST as any, nodePath as any, visitPath);
        } catch (EarlyExitFromVIsitorException) { }

        return rst;
    }

}
