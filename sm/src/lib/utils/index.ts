/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import chance from 'chance';
import debug from '../../utils/debug';
import { CompilerSettings, StandardOutput as StandardCompilerOutput } from 'ethereum-types';
import fs from 'fs';
import lodash, { get as lodash_get, clone as lodash_clone, isEqualWith as lodash_isEqualWith } from 'lodash';
import path from 'path';
import solc_original from 'solc';
import { ASTNode, ASTNodeTypeString, Visitor, LineColumn, CodeRange, ContractDefinition, FunctionDefinition } from 'solidity-parser-antlr';
import { DeepReadonly, Dictionary, UnionToIntersection } from 'ts-essentials';
import util from 'util';
import logger from '../../utils/logger';
import assert from 'assert';
import os from 'os';
import { getNodePathScopeInfo } from './NodePathUtils';
import { Merge } from 'ts-essentials';
import { InterestedSpace } from '../InterestedSpace/InterestedSpace';
import FaultSpace from '../FaultSpace';

export * from './NodePathUtils';

export type Number_String = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';

// Note: when executing, __filename is in the build directory
let solc_path = path.join(path.dirname(__filename), '..', '..', '..', '..', 'solc-bin', 'soljson-v0.4.24+commit.e67f0147.js');
if (!fs.existsSync(solc_path)) {
  solc_path = path.join(path.dirname(__filename), '..', '..', '..', 'solc-bin', 'soljson-v0.4.24+commit.e67f0147.js');
}
const solc_0_4_24 = solc_original.setupMethods(require(solc_path));

export type Intersection_ASTNode = UnionToIntersection<ASTNode>;
export type NodePath = (keyof Intersection_ASTNode | Number_String)[];
export type NodePropertyPath = NodePath;

export function retNodeType(node: ASTNode): ASTNode['type'] {
  return node.type;
}

// From @types/chance but it doesn't export this type..
export type Seed = number | string;

/*

Return generator function of the cartesian product of iterators

*/
export function* cartesianProduct<T>(...sets: ReadonlyArray<() => IterableIterator<T>>): IterableIterator<T[]> {
  if (sets.length === 0) {
    yield [];
    return;
  } else {
    const thisGen = sets[0]();
    if (!thisGen) {
      throw new Error();
    }
    for (const s of thisGen) {
      const gen = cartesianProduct(...sets.slice(1));
      for (const g of gen) {
        yield [s, ...g];
      }
    }
    return;
  }
}

export function* combination<T>(...sets: ReadonlyArray<() => IterableIterator<T>>): IterableIterator<T[]> {
  if (sets.length === 0) {
    yield [];
    return;
  } else {
    const thisGen = sets[0]();
    if (!thisGen) {
      throw new Error();
    }
    for (const s of thisGen) {
      const gen = combination(...sets.slice(1));
      for (const g of gen) {
        if (g.includes(s)) {
          continue;
        }
        yield [s, ...g];
      }
    }
    return;
  }
}

export function isASTNode(node: ASTNode | DeepReadonly<ASTNode>): node is ASTNode {
  return !!node && typeof node === 'object' && node.hasOwnProperty('type');
}

export const disallowKeys = new Set([
  'range', // Source map information
  'loc', // Source map information
  'comments', // Added by prettier-plugin-solidity
  'arguments', // In invocation related(AssemblyCall/AssemblySwitch) nodes
  'parameters', // In FunctionDeclaration/EventDeclaration
  'parameterTypes', // In FunctionDeclaration
  'returnTypes', // In FunctionDeclaration
  'modifiers', // In FunctionDeclaration
  'names', // For keyword arguments
  'variables', // In StateVariableDeclaration/VariableDeclarationStatement nodes
  'components', // In ReturnStatement/IdentifierList/TupleExpression nodes
  'members', // Occur in Enum/StructDefinition nodes
  'baseContracts', // In ContractDefinition nodes
  'symbolAliases', // In ImportDirective nodes
  'operations', // In InlineAssemblyStatement/AssemblyBlock nodes
  'cases', // In AssemblySwitch nodes
  'returnArguments', // In AssemblyFunctionDefinition
] as const); // Elements to be disallowed to be modified

export const astNodeTypeStrings: ReadonlyArray<ASTNodeTypeString> = [
  'SourceUnit',
  'PragmaDirective',
  'PragmaName',
  'PragmaValue',
  'Version',
  'VersionOperator',
  'VersionConstraint',
  'ImportDeclaration',
  'ImportDirective',
  'ContractDefinition',
  'InheritanceSpecifier',
  'StateVariableDeclaration',
  'UsingForDeclaration',
  'StructDefinition',
  'ModifierDefinition',
  'ModifierInvocation',
  'FunctionDefinition',
  'ModifierList',
  'EventDefinition',
  'EnumValue',
  'EnumDefinition',
  'ParameterList',
  'Parameter',
  'EventParameterList',
  'EventParameter',
  'FunctionTypeParameterList',
  'FunctionTypeParameter',
  'VariableDeclaration',
  'ArrayTypeName',
  'UserDefinedTypeName',
  'Mapping',
  'FunctionTypeName',
  'StorageLocation',
  'StateMutability',
  'Block',
  'LineComment',
  'BlockComment',
  'ExpressionStatement',
  'IfStatement',
  'WhileStatement',
  'ForStatement',
  'InlineAssemblyStatement',
  'DoWhileStatement',
  'ContinueStatement',
  'BreakStatement',
  'ReturnStatement',
  'ThrowStatement',
  'VariableDeclarationStatement',
  'IdentifierList',
  'ElementaryTypeName',
  'NewExpression',
  'ExpressionList',
  'NameValueList',
  'NameValue',
  'FunctionCall',
  'FunctionCallArguments',
  'AssemblyBlock',
  'AssemblyItem',
  'AssemblyCall',
  'AssemblyLocalDefinition',
  'AssemblyAssignment',
  'AssemblyIdentifierOrList',
  'AssemblyIdentifierList',
  'AssemblyStackAssignment',
  'LabelDefinition',
  'AssemblySwitch',
  'AssemblyCase',
  'AssemblyFunctionDefinition',
  'AssemblyFunctionReturns',
  'AssemblyFor',
  'AssemblyIf',
  'AssemblyLiteral',
  'SubAssembly',
  'TupleExpression',
  'ElementaryTypeNameExpression',
  'StringLiteral',
  'BooleanLiteral',
  'NumberLiteral',
  'Identifier',
  'IndexAccess',
  'MemberAccess',
  'UnaryOperation',
  'BinaryOperation',
  'Conditional',
];

export const AssertionIdentifierNames = ['assert', 'require', 'revert'];

/**
 *
 * Note: by right, the passed array should be a generic type, and let typescript auto inferring the exact type in each case
 *  But, comes out that typescript compiler is too slow when doing so.
 *  TODO: try this again when upgrading to TypeScript ^3.5.3
 * 
 * @param iter An array
 */
export function arrayToGenerator(iter: DeepReadonly<any[]>): (random: boolean | Seed) => IterableIterator<any> {

  return (random: boolean | Seed = false) => {
    const newIter = ![false, undefined].includes(random as any)
      ? (random === true ? new chance() : new chance(random as Seed)).shuffle(iter as any[])
      : iter;
    return newIter[Symbol.iterator]();
  };
}

function _isASTNode(node: any): node is ASTNode {
  return !!node && typeof node === 'object' && node.hasOwnProperty('type');
}

export function visitWithPath(
  node: any,
  visitor: { readonly [k in keyof Visitor]: (node: Parameters<NonNullable<Visitor[k]>>[0], path: NodePath) => any },
  path: NodePath = [],
) {
  if (Array.isArray(node)) {
    node.forEach((child, idx) => visitWithPath(child, visitor, [...path, idx.toString()] as NodePath));
  }

  if (!_isASTNode(node)) {
    return;
  }

  let cont = true;

  if (visitor[node.type] !== undefined) {
    cont = visitor[node.type]!(node as any, path);
  }

  if (cont === false) {
    return;
  }

  for (const prop in node) {
    if (node.hasOwnProperty(prop)) {
      visitWithPath(node[prop as keyof typeof node], visitor, [...path, prop] as NodePath);
    }
  }

  const selector = node.type + ':exit';
  if ((<any>visitor)[selector] !== undefined) {
    (<any>visitor)[selector](node, path);
  }
}

export function recPathOfFunctions<T extends any>(obj: T, initPath: string[] = []): string[][] {

  if(typeof obj === 'function') {
    return [[]];
  }

  const rst: string[][] = [];

  for (const prop in obj) {
    switch (typeof obj[prop]) {
      case 'function': {
        rst.push([...initPath, prop]);
        break;
      }
      case 'object': {
        rst.push(...recPathOfFunctions(obj[prop], [...initPath, prop]));
        break;
      }

      default: {
        // noop
      }
    }
  }

  return rst;
}

export function recPathOfPrimitives<T extends any>(obj: T, initPath: string[] = []): string[][] {

  const rst: string[][] = [];

  for (const prop in obj) {
    switch (typeof obj[prop]) {
      case 'function': {
        break;
      }
      case 'object': {
        if(obj[prop] !== null) {
          rst.push(...recPathOfPrimitives(obj[prop], [...initPath, prop]));
        } else {
          rst.push([...initPath, prop]);
        }
        break;
      }

      default: {
        rst.push([...initPath, prop]);
      }
    }
  }

  return rst;
}

const debugLogger_compile = debug('compile');
const debugLogger_compile_err = debugLogger_compile.extend('err');
const debugLogger_compile_succ = debugLogger_compile.extend('succ');
const debugLogger_compile_start = debugLogger_compile.extend('start');

type Compiled_Binary = string;

export function compile(contractSrcStr: string, optimize: boolean | number = false, retBin: boolean = false): boolean | Dictionary<Compiled_Binary, string> {
  debugLogger_compile_start('Compilation start...');
  const compileOutput: StandardCompilerOutput = JSON.parse(
    solc_0_4_24.compile(
      JSON.stringify({
        language: 'Solidity',
        sources: {
          'main.sol': {
            content: contractSrcStr,
          },
        },
        settings: {
          optimizer: {
            enabled: typeof optimize === 'boolean' ? optimize : true,
            runs: typeof optimize === 'number' ? optimize : 200,
          } as CompilerSettings['optimizer'],
          outputSelection: {
            '*': {
              '*': ['evm.bytecode.object'],
            },
          } as CompilerSettings['outputSelection'],
        },
      }),
    ),
  );

  if (typeof compileOutput.errors !== 'undefined') {
    debugLogger_compile_err(util.inspect(compileOutput.errors, true, Infinity));

    for (const error of compileOutput.errors) {
      switch (error.type) {
        case 'Warning':
        case 'DocstringParsingError': {
          continue;
        }

        case 'ParserError':
        case 'SyntaxError':
        case 'DeclarationError':
        case 'TypeError': {
          return false;
        }

        default: {
          // throw new Error(`Unknown error from solc: ${util.inspect(error)}`);
          logger.error(`Unknown error from solc: ${util.inspect(error)}`);
          return false;
        }
      }
    }
  }

  debugLogger_compile_succ(`Compile succeeded`);

  if (!retBin) {
    return true;
  } else {
    const allContractOuts = compileOutput.contracts['main.sol'];
    const binObj: Dictionary<string, string> = {};
    Object.keys(allContractOuts).forEach(
      contracts => (binObj[contracts] = allContractOuts[contracts].evm.bytecode.object),
    );
    return binObj;
  }
}

export function deepOmit(obj: any, keys: any[]): any {
  function rec(obj: any) {
    return lodash.transform(obj, (rst: any, val, key) => {
      if (keys.includes(key)) {
        return;
      }
      rst[key] = typeof obj[key] === 'object' ? rec(obj[key]) : val;
    });
  }

  return rec(obj);
}

export function arrStartsWithArr<T>(arr: DeepReadonly<T[]>, maybeStartWith: DeepReadonly<T[]>): boolean {
  return maybeStartWith.every((val, idx) => arr[idx] === val);
}

export function ASTNodeRemoveExtraAttributesDeep(node: ASTNode): void {
  ASTNodeRemoveAttrsDeep(node, ['tokens']);
}

export function ASTNodeRemoveLocDeep(node: ASTNode): void {
  ASTNodeRemoveAttrsDeep(node, ['range', 'loc']);
}

export function ASTNodeRemoveAttrsDeep(node: ASTNode, attributesToRemove: string[]): void {
  ASTNodeRemoveAttrs(node, attributesToRemove);
  for (const attr_ in node) {
    const attr = attr_ as keyof typeof node;
    if (typeof node[attr] === 'object') {
      ASTNodeRemoveLocDeep(node[attr] as any);
    }
  }
}

// This only performs for the top-most level
export function ASTNodeRemoveAttrs(node: ASTNode, attributesToRemove: string[]): void {

  for (const attr in node) {
    if (attributesToRemove.includes(attr)) {
      delete node[attr as keyof typeof node];
    }
  }
}

export function astNodeContainsNonEmptyBlock(node: DeepReadonly<ASTNode>): boolean {

  if (node['type'] === 'Block') {
    if (node['statements'].length !== 0) {
      return true;
    } else {
      return astNodeContainsNonEmptyBlock(node['statements'] as any);
    }
  } else {

    for (const key_ in node) {
      const key = key_ as keyof typeof node;

      if (Object.hasOwnProperty(node[key] as any)) {
        if (astNodeContainsNonEmptyBlock(node[key] as any)) {
          return true;
        }
      }
    }

    return false;

  }
}

export function deletableFaultSpace(ast: DeepReadonly<ASTNode>, faultSpaces: DeepReadonly<FaultSpace[]>, onlyDeleteNodeType: undefined | ASTNodeTypeString[] = undefined): FaultSpace[] {
  return faultSpaces.filter(faultSpace => {

    const nodeParent = lodash_get(ast, faultSpace.nodePath.slice(0, -1));
    assert(nodeParent !== undefined);
    const node: ASTNode = lodash_get(nodeParent, faultSpace.nodePath.slice(-1));
    assert(node !== undefined && node !== null, `invalid node found!${os.EOL}${util.inspect(node, true, Infinity, true)}`);

    if (onlyDeleteNodeType !== undefined && !onlyDeleteNodeType.includes(node.type)) {
      return false;
    }

    if (node.type === 'FunctionCall') {
      if (node.expression.type === 'Identifier') {
        // Shouldn't delete any assertion related statements as they are written by original developer intentionally to make sure some of things go right
        if (AssertionIdentifierNames.includes(node.expression.name)) {
          return false;
        }
      }
    }

    // Disable deleting non-empty codeblock
    return Array.isArray(nodeParent) && faultSpace.nodePath.every(x => !disallowKeys.has(x as any)) && !astNodeContainsNonEmptyBlock(node);
  }) as FaultSpace[];
}

export function objPathVisit<IDX extends number, T extends { [k in U[IDX]]: T[U[IDX]] }, U extends readonly (keyof T)[]>(obj: T, visitPath: U, visitorFn: (currObj: T) => boolean): void {
  if (visitorFn(obj) && visitPath.length !== 0) {
    objPathVisit(obj[visitPath[0]], visitPath.slice(1), visitorFn);
  }
}

// export function isPrefixArray<T extends any>(arr: T[], prefixArr: T[]): boolean {
//   for (let i =0; i < prefixArr.length; i++) {
//     if(arr[i] !== prefixArr[i]) {
//       return false;
//     }
//   }

//   return true;
// }


export function cmpLineColumn(a: LineColumn, b: LineColumn): number {
  if (a.line === b.line) {
    return a.column - b.column;
  } else {
    return a.line - b.line;
  }
}

export function locationDisjoint_Above(loc: CodeRange, above: CodeRange): boolean {
  return cmpLineColumn(loc.start, above.start) < 0 && cmpLineColumn(loc.end, above.start) < 0;
}

export function locationDisjoint_Below(loc: CodeRange, below: CodeRange): boolean {
  return cmpLineColumn(loc.start, below.end) > 0 && cmpLineColumn(loc.end, below.end) > 0;
}

export function locationDisjoint(a: CodeRange, b: CodeRange): boolean {
  return locationDisjoint_Above(a, b) || locationDisjoint_Below(a, b);
}

export function locationIntersect(a: CodeRange, b: CodeRange): boolean {

  // Start of a is inside b
  return (cmpLineColumn(a.start, b.start) >= 0 && cmpLineColumn(a.start, b.end) <= 0) ||
    // Start of b is inside a
    (cmpLineColumn(b.start, a.start) >= 0 && cmpLineColumn(b.start, a.end) <= 0)
}

export interface ScopeInfo {
  contractName?: string,
  functionName?: string | null
}

export function isNodePathInScope(ast: DeepReadonly<ASTNode>, nodePath: DeepReadonly<NodePath>, contractNames: undefined | string[] = undefined, functionNames: undefined | (string | null)[] = undefined): boolean {
  const scope = getNodePathScopeInfo(ast, nodePath);
  // It's ok even if the scope information for the `nodePath` is undefined
  return (contractNames === undefined || contractNames.includes(scope.contractName as any)) && (functionNames === undefined || functionNames.includes(scope.functionName as any));
}

export function getASTNodeFromPath(ast: DeepReadonly<ASTNode>, nodePath: DeepReadonly<NodePath>): ASTNode {
  return lodash_get(ast, nodePath);
}

export function findASTParentNode(ast: DeepReadonly<ASTNode>, nodePath: DeepReadonly<NodePath>): NodePath | null {
  for (let i = nodePath.length - 1; i >= 1; i--) {

    const parentPath = nodePath.slice(0, i);

    if (isASTNode(getASTNodeFromPath(ast, parentPath))) {
      return parentPath;
    }
  }

  return null;

}

const nonFunctionalRelatedAttributes = ['tokens', 'comments', 'loc', 'range'];
export const ASTFunctionalEqualCompareCustomizer: lodash.IsEqualCustomizer = (objVal, othVal, key) => {
  if (nonFunctionalRelatedAttributes.includes(key as any)) {
    return true;
  } else if (((typeof objVal === 'object' && objVal !== null) && nonFunctionalRelatedAttributes.some((x) => objVal.hasOwnProperty(x)))
    || ((typeof othVal === 'object' && othVal !== null) && nonFunctionalRelatedAttributes.some((x) => othVal.hasOwnProperty(x)))) {
    const newObjVal = lodash_clone(objVal);
    ASTNodeRemoveAttrs(newObjVal, nonFunctionalRelatedAttributes);

    const newOthVal = lodash_clone(othVal);
    ASTNodeRemoveAttrs(newOthVal, nonFunctionalRelatedAttributes);

    return lodash_isEqualWith(newObjVal, newOthVal, ASTFunctionalEqualCompareCustomizer);
  } else {
    return undefined;
  }
}

export function generatorFilter<T extends any>(genFunc: (random: boolean | Seed) => IterableIterator<T>, filterFn: (val: T) => boolean): (random: boolean | Seed) => IterableIterator<T> {

  return (function* (random: boolean | Seed) {
    for (const val of genFunc(random)) {
      if (filterFn(val)) {
        yield val;
      }
    }
  });

}

export function generateFaultSpace(
  ast: DeepReadonly<ASTNode>,
  interestedSpace: DeepReadonly<InterestedSpace[]> | undefined,
): FaultSpace[] {

  let faultSpace: (ReturnType<typeof generateFaultSpace>) extends (infer U)[] ? Merge<U, {  }>[] : never = [];

  let fnDepth: number = 0;

  const predefined = {
    ContractDefinition(node: ContractDefinition, path: NodePath) {

      return interestedSpace === undefined ? true : interestedSpace.some((space) => space.isNodeInterested(node, path, ast));

    },

    FunctionDefinition(node: FunctionDefinition, path: NodePath) {

      if (interestedSpace === undefined || interestedSpace.some((space) => space.isNodeInterested(node, path, ast))) {
        fnDepth++;
        logger.debug(`Found interested function ${node.name}`);
        return true;
      } else {
        return false;
      }

    },

    'FunctionDefinition:exit'(_node: ASTNode, _path: NodePath) {
      fnDepth--;
    },
  };

  const generalVisitorFn = (node: ASTNode, path: NodePath) => {

    if (fnDepth !== 0) {
      // Ether flow preservation block
      const methodName_externalCalls = [
        'send',
        'transfer',
        'call',
        'delegatecall',
        'callcode',
      ];

      const parentNode = getASTNodeFromPath(ast, findASTParentNode(ast, path)!) as DeepReadonly<ASTNode>;
      // NOTE: only the parts of function call are not in the fault space. The function call itself, however, can be in.
      const isEtherFlowRelated = parentNode.type === 'FunctionCall' && parentNode.expression.type === 'MemberAccess' && methodName_externalCalls.includes(parentNode.expression.memberName);

      if (isEtherFlowRelated) {
        return false;
      }
    }

    {
        const isWantedASTNodeType = !(node.type === 'EmitStatement');

        if(!isWantedASTNodeType) {
          return false;
        }
    }

    const inExactScope = (
      interestedSpace === undefined || interestedSpace.some((space) => space.isNodeInExactScope(node, path, ast))
    );

    if (fnDepth !== 0 && inExactScope) {
      faultSpace.push({ nodePath: path });
      return true;
    } else {
      const isNodeInterested = interestedSpace === undefined || interestedSpace.some((space) => space.isNodeInterested(node, path, ast));
      return isNodeInterested;
    }

  };

  const visitor = new Proxy(
    {},
    {
      get(_target, property, _receiver) {
        return typeof (predefined as any)[property] !== 'undefined'
          ? predefined[property as keyof typeof predefined]
          : (property as string).endsWith(':exit')
            ? () => undefined
            : generalVisitorFn;
      },
    },
  );

  visitWithPath(ast, visitor);

  const rst = faultSpace.map(({ nodePath }) => {
    return {
      nodePath,
    };
  });

  return rst;
}

export function stripSwarmMetadata(binWithSwarmData: string): string {

  const RE_SWARM_REPLACE = /(a165627a7a72305820)([0-9a-f]{64})(0029)$/;
  
  return binWithSwarmData.replace(RE_SWARM_REPLACE, '');
}