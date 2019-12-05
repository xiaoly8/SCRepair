/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import assert from 'assert';
import { at as lodash_at, cloneDeep as lodash_cloneDeep, set as lodash_set, isEqualWith as lodash_equalWith } from 'lodash';
import {
  ASTNode,
  ASTNodeTypeString,
  BinaryOperation,
  BinOp,
  ExpressionStatement,
  NumberLiteral,
  CodeRange,
  Identifier,
  Expression,
  EventDefinition,
  FunctionCall,
  ASTNodeByTypeString,
} from 'solidity-parser-antlr';
import { DeepReadonly, Dictionary } from 'ts-essentials';
import { arrayToGenerator, astNodeTypeStrings, cartesianProduct, deepOmit, recPathOfFunctions, Seed, ScopeInfo, NodePath, getNodePathScopeInfo, visitWithPath, generatorFilter, Intersection_ASTNode, isASTNode } from './utils';


const binOps: BinOp[] = [
  '+',
  '-',
  '*',
  '/',
  '&&',
  '||',
  '&',
  '|',
  '<',
  '>',
  '<=',
  '>=',
  '==',
  '!=',
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
];

type ASTSpaceObj = { [k in Exclude<keyof Intersection_ASTNode, 'range' | 'loc'>]?: (string | any[] | ((...args: any[]) => any)) };

/* tslint:disable-next-line:no-unnecessary-class */
export default class ASTNodeSpace implements DeepReadonly<Dictionary<(ctx: NewNodeGenerationContext | undefined) => undefined | ASTSpaceObj | ASTSpaceObj[] | ((...args: any[]) => any), 'FunctionCall'>> {

  public constructor() {
  }

  /*
  Note: this return value is actually known in compile-time in the current implementation. But, this is a runtime function for now.
  */
  public get supportedNodeTypes() {
    return astNodeTypeStrings.filter(this.isNodeTypeSupported.bind(this));
  }

  protected readonly ASTNodeMapSet: Map<ASTNodeTypeString, Set<{ readonly node: ASTNode, readonly scopeInfo: ScopeInfo }>> = new Map(
    astNodeTypeStrings.map(ele => [ele, new Set() as Set<{ readonly node: ASTNode, readonly scopeInfo: ScopeInfo }>] as const),
  );


  public ExpressionStatement(ctx: NewNodeGenerationContext | undefined = undefined) /* tslint:disable-line:typedef */ {
    // The calcuated space might contain duplicate elements

    return {
      type: 'ExpressionStatement',
      // Note: expression can deduplicate but it requires memory
      expression: arrayToGenerator([
        this.BinaryOperationStatement(ctx),
        this.FunctionCall(ctx),
        ...Array.from(
          this.getReusableNodeSet('ExpressionStatement', ctx !== undefined ? ctx.scopeInfo : undefined),
          (ele: ExpressionStatement) => ele.expression,
        ),
      ]),
    };
  }
 
  public FunctionCall(ctx: NewNodeGenerationContext | undefined = undefined) /* tslint:disable-line:typedef */ {
    const space_assertionCall = {
      type: 'FunctionCall',
      expression: {
        type: 'Identifier',
        name: arrayToGenerator(['require', 'assert']),
      },
      arguments: [
        arrayToGenerator([
          // this.BoolBinaryOperation(ctx),
          ...Array.from(
            this.getReusableNodeSet('ExpressionStatement', ctx !== undefined ? ctx.scopeInfo : undefined),
            (ele: ExpressionStatement) => ele.expression,
          ),])
      ],
      names: [], // Not synthesizing named argument
    };

    return arrayToGenerator([space_assertionCall]);
  }
  
  public BooleanLiteral(_ctx: NewNodeGenerationContext | undefined = undefined) /* tslint:disable-line:typedef */ {
    return {
      type: 'BooleanLiteral',
      value: arrayToGenerator([true, false]),
    };
  }
  public NumberLiteral(ctx: NewNodeGenerationContext | undefined = undefined) /* tslint:disable-line:typedef */ {
    return {
      type: 'NumberLiteral',
      number: arrayToGenerator([
        '0',
        '1',
        // '2',
        ...Array.from(this.getReusableNodeSet('NumberLiteral', ctx !== undefined ? ctx.scopeInfo : undefined), (ele: NumberLiteral) => ele.number),
      ]),
      subdenomination: arrayToGenerator([
        null,
        // 'wei',
        // 'szabo',
        // 'finney',
        // 'ether',
        // 'seconds',
        // 'minutes',
        // 'hours',
        // 'days',
        // 'weeks',
        // 'years',
      ]),
    };
  }
 
  public Identifier(ctx: NewNodeGenerationContext | undefined = undefined) /* tslint:disable-line:typedef */ {
    if (ctx === undefined) {
      return undefined;
    } else {
      return [...(this.getReusableNodeSet('Identifier', ctx !== undefined ? ctx.scopeInfo : undefined))];
    }
  }
  public UnaryOperation() /* tslint:disable-line:typedef */ {
    return undefined;
  }
  public BinaryOperation(ctx: NewNodeGenerationContext | undefined = undefined) /* tslint:disable-line:typedef */ {
    return {
      type: 'BinaryOperation',
      left: arrayToGenerator([
        ...Array.from(
          this.getReusableNodeSet('BinaryOperation', ctx !== undefined ? ctx.scopeInfo : undefined),
          (ele: BinaryOperation) => ele.left,
        ),
      ]) as (random: boolean | Seed) => IterableIterator<Expression>,
      right: arrayToGenerator([
        ...Array.from(
          this.getReusableNodeSet('BinaryOperation', ctx !== undefined ? ctx.scopeInfo : undefined),
          (ele: BinaryOperation) => ele.right,
        ),
      ]) as (random: boolean | Seed) => IterableIterator<Expression>,
      operator: arrayToGenerator(binOps),
    };
  }
  public Conditional() /* tslint:disable-line:typedef */ {
    return undefined;
  }

  // Custom space generators

  public BoolBinaryOperation(ctx: NewNodeGenerationContext | undefined = undefined) {
    const binaryOperationExpressionGeneratorFilter = <T extends Parameters<typeof generatorFilter>[0]>(generator: T, forbiddenTypes: readonly ASTNodeTypeString[]) => generatorFilter(generator, (x: Expression) => (forbiddenTypes.includes(x.type)));


    const boolValuedBinOps_forBool: readonly BinOp[] = [
      '&&',
      '||',
    ];

    const forbiddenTypes_forBool: readonly ASTNodeTypeString[] = ['NumberLiteral', 'HexLiteral'];
    const space_forBool = this.BinaryOperation(ctx);
    space_forBool.operator = arrayToGenerator(boolValuedBinOps_forBool);
    space_forBool.left = binaryOperationExpressionGeneratorFilter(space_forBool.left, forbiddenTypes_forBool);
    space_forBool.right = binaryOperationExpressionGeneratorFilter(space_forBool.right, forbiddenTypes_forBool);

    const boolValuedBinOps_forNumber: BinOp[] = [
      '<',
      '>',
      '<=',
      '>=',
    ];
    const forbiddenTypes_forNumber: readonly ASTNodeTypeString[] = ['BooleanLiteral'];
    const space_forNumber = this.BinaryOperation(ctx);
    space_forNumber.operator = arrayToGenerator(boolValuedBinOps_forNumber);
    space_forNumber.left = binaryOperationExpressionGeneratorFilter(space_forNumber.left, forbiddenTypes_forNumber);
    space_forNumber.right = binaryOperationExpressionGeneratorFilter(space_forNumber.right, forbiddenTypes_forNumber);

    const boolValuedBinOps_forAllTypes: BinOp[] = [
      '==',
      '!=',
    ];
    const space_forAllTypes = this.BinaryOperation(ctx);
    space_forAllTypes.operator = arrayToGenerator(boolValuedBinOps_forAllTypes);

    return arrayToGenerator([space_forBool, space_forNumber, space_forAllTypes]);
  }

  // `BinaryOperation` expressions that can be a statement
  public BinaryOperationStatement(ctx: NewNodeGenerationContext | undefined = undefined) {
    return this.AssignmentOperation(ctx);
  }

  public NumberArithmeticAssignmentOperation(ctx: NewNodeGenerationContext | undefined = undefined) {
    const numberArithmeticAssignmentBinOps: BinOp[] = [
      '+=',
      '-=',
      '*=',
      '/=',
    ];

    const identifiers = this.Identifier(ctx);
    if (identifiers === undefined) {
      return undefined;
    }

    const binOpSpace = this.BinaryOperation(ctx);
    binOpSpace.left = arrayToGenerator(identifiers);
    binOpSpace.operator = arrayToGenerator(numberArithmeticAssignmentBinOps);
    binOpSpace.right = arrayToGenerator([...identifiers, this.NumberLiteral(ctx)]);
    return binOpSpace;

  }

  public AssignmentOperation(ctx: NewNodeGenerationContext | undefined = undefined) {

    const statementBinOps: BinOp[] = [
      '=',
    ];
    const identifiers = this.Identifier(ctx);
    if (identifiers === undefined) {
      return undefined;
    }

    const binOpSpace = this.BinaryOperation(ctx);
    binOpSpace.left = arrayToGenerator(identifiers);
    binOpSpace.operator = arrayToGenerator(statementBinOps);

    // function invalidNodeFilter(binOp: BinaryOperation): boolean {
    //   return !(binOp.left.type === 'Identifier' && binOp.right.type === 'Identifier' && binOp.left.name === binOp.right.name);
    // }

    return arrayToGenerator([binOpSpace]);
  }

  //==========================================================================================================================


  public isNodeTypeSupported(type: ASTNodeTypeString) {
    return typeof (this as any)[type] !== 'undefined' && typeof (this as any)[type]() !== 'undefined';
  }

  public *getASTNodeGenerator(nodeType: ASTNodeTypeString, ctx: NewNodeGenerationContext | undefined = undefined, seed?: Seed): IterableIterator<ASTNode> {
    const nodeSpace = (this as any)[nodeType](ctx);
    if (typeof nodeSpace === 'undefined') {
      throw new Error(`nodeType ${nodeType} is unsupported`);
    }

    yield* this.processSpace(nodeSpace as any, seed);

    return;
  }

  protected *processSpace(
    space: { [k in ASTNodeTypeString & keyof ASTNodeSpace]: any } | ((seed?: Seed) => IterableIterator<any>),
    seed?: Seed,
  ): IterableIterator<any> {
    const gen_paths = recPathOfFunctions(space);

    if (gen_paths.length !== 0) {

      let gens: readonly (() => IterableIterator<any>)[];
      const topLevelSpace = gen_paths.length === 1 && gen_paths[0].length === 0;
      if (topLevelSpace) {
        gens = [(space as ((seed?: Seed) => IterableIterator<any>)).bind(undefined, seed)];
      } else {
        gens = (lodash_at as any)(space, gen_paths).map(
          (x: (seed?: Seed) => IterableIterator<any>) => x.bind(undefined, seed),
        );
      }

      for (const genRst of cartesianProduct(...gens)) {

        let newGenObj;
        if (topLevelSpace) {
          newGenObj = genRst[0];
        } else {
          newGenObj = lodash_cloneDeep(space);
          for (const i in genRst) {
            lodash_set(newGenObj, gen_paths[i], genRst[i]);
          }
        }

        yield* this.processSpace(newGenObj as typeof space);
      }
    } else {
      yield space;
    }

    return;
  }

  protected buildASTNodeSet_visitor(ast: DeepReadonly<ASTNode>, node_: DeepReadonly<ASTNode>, nodePath: DeepReadonly<NodePath>): any {
    const set = this.ASTNodeMapSet.get(node_.type);
    assert(set !== undefined, `node has unknown node type: ${node_.type}`);

    const node = lodash_cloneDeep(node_) as ASTNode;

    const newNodeObj = recRemoveLocInfo(node);
    set!.add({ node: newNodeObj, scopeInfo: getNodePathScopeInfo(ast, nodePath) });

    // Don't return false to keep traversing the AST tree
    return true;
  }

  protected getPredefinedASTNodeSet<T_NodeTypeString extends ASTNodeTypeString>(nodeTypeString: T_NodeTypeString, scopeInfo: ScopeInfo | undefined = undefined): Set<ASTNodeByTypeString<T_NodeTypeString, ASTNode>> {
    let relevantNodeScopes = [...this.ASTNodeMapSet.get(nodeTypeString)!];

    if (scopeInfo !== undefined) {
      relevantNodeScopes = relevantNodeScopes.filter((x) => x.scopeInfo === undefined ? false :
        (x.scopeInfo.contractName === scopeInfo.contractName && (scopeInfo.functionName === undefined || scopeInfo.functionName === x.scopeInfo.functionName)));
    }

    return new Set(relevantNodeScopes.map((x) => x.node)) as Set<ASTNodeByTypeString<T_NodeTypeString, ASTNode>>;
  }

  protected getReusableNodeSet<T_NodeTypeString extends ASTNodeTypeString>(nodeTypeString: T_NodeTypeString, scopeInfo: ScopeInfo | undefined = undefined): Set<ASTNodeByTypeString<T_NodeTypeString, ASTNode>> {
    const predefineNodeSet = this.getPredefinedASTNodeSet(nodeTypeString, scopeInfo);

    if (predefineNodeSet.size === 0) {
      return predefineNodeSet;
    }

    switch (nodeTypeString) {
      case 'ExpressionStatement': {
        const predefineNodeSet_ = predefineNodeSet as Set<ExpressionStatement>;
        return new Set([...predefineNodeSet_].filter((x) => {

          const isAssignmentStatement = x.expression.type === 'BinaryOperation' && x.expression.operator === '=';
          const isEventEmittingStatement = scopeInfo !== undefined && scopeInfo.contractName !== undefined && x.expression.type === 'FunctionCall' && x.expression.expression.type === 'Identifier' && [...this.getPredefinedASTNodeSet('EventDefinition', {
            contractName: scopeInfo.contractName
          })].some((eventDefinition: EventDefinition) => {
            const functionCallFunctionExpression = (x.expression as FunctionCall).expression as Identifier;
            return eventDefinition.name === functionCallFunctionExpression.name;
          });

          return !(isAssignmentStatement || isEventEmittingStatement);
        })) as Set<ASTNodeByTypeString<T_NodeTypeString, ASTNode>>;
      }

      // case 'BinaryOperation': {
      //   const predefineNodeSet_ = predefineNodeSet as Set<BinaryOperation>;
      //   return new Set([...predefineNodeSet_].filter((x) => {

      //     const isAssignmentExpression = 'BinaryOperation' && x.operator === '=';

      //     return !(isAssignmentExpression);
      //   })) as Set<ASTNodeByTypeString<T_NodeTypeString, ASTNode>>;
      // }

    }

    return predefineNodeSet;
  }

  public isNodeInSpace(node: DeepReadonly<ASTNode>, ctx: NewNodeGenerationContext = new NewNodeGenerationContext(undefined, undefined)): boolean {
    assert(isASTNode(node));

    const type = node.type;
    const nodeSpace = (this as any)[type](ctx);

    if (nodeSpace === undefined) {
      return false;
    }

    function processSpace(
      space: { [k in ASTNodeTypeString & keyof ASTNodeSpace]: any } | ((seed?: Seed) => IterableIterator<any>),
      target: DeepReadonly<ASTNode>,
      seed?: Seed,
    ): boolean {

      // const primitivePaths = recPathOfPrimitives(space);
      // if(primitivePaths.some((x)=>! lodash_equalWith(lodash_get, isEqualWith as lodash_equalWith(space, x) )

      if (!lodash_equalWith(space, target, (objVal, _othVal) => {
        if (typeof objVal === 'function') {
          // The field being checked in not generated yet
          return true;
        } else {
          return undefined;
        }
      })) {
        return false;
      }

      const gen_paths = recPathOfFunctions(space);
      assert(gen_paths.length !== 0);

      let gens: readonly (() => IterableIterator<any>)[];
      const topLevelSpace = gen_paths.length === 1 && gen_paths[0].length === 0;
      if (topLevelSpace) {
        gens = [(space as ((seed?: Seed) => IterableIterator<any>)).bind(undefined, seed)];
      } else {
        gens = (lodash_at as any)(space, gen_paths).map(
          (x: (seed?: Seed) => IterableIterator<any>) => x.bind(undefined, seed),
        );
      }

      for (const genRst of cartesianProduct(...gens)) {

        let newGenObj;
        if (topLevelSpace) {
          newGenObj = genRst[0];
        } else {
          newGenObj = lodash_cloneDeep(space);
          for (const i in genRst) {
            lodash_set(newGenObj, gen_paths[i], genRst[i]);
          }
        }

        const rst = processSpace(newGenObj as typeof space, target);
        if (rst) {
          return true;
        }
      }

      return false;
    }

    return processSpace(nodeSpace as any, node);
  }

}

export class RandomASTNodeSpace extends ASTNodeSpace {
  public constructor(public AST: DeepReadonly<ASTNode>) {
    super();

    // let a: keyof ASTNodeSpace;
    const thisCls = this;

    visitWithPath(
      AST as ASTNode,
      new Proxy(
        {},
        {
          get(_target, property, _receiver) {
            if ((property as string).endsWith(':exit')) {
              // I want to skip this code https://github.com/federicobond/solidity-parser-antlr/blob/906d7ab5bb404fb392db52d133274d81da4e988d/src/index.js#L107
              return undefined;
            } else {
              return thisCls.buildASTNodeSet_visitor.bind(thisCls, AST);
            }
          },
        },
      ) as any,
    );
  }
}

export class SeededASTNodeSpace extends ASTNodeSpace {

  protected constructor(ASTNodes: DeepReadonly<ASTNode[]>) {
    super();
    for (const astNode of ASTNodes) {
      // Don't need scopeInfo being generated
      this.buildASTNodeSet_visitor({} as any, astNode, []);
    }
  }

  public static getSeededASTNodeSpace(ASTNodes: DeepReadonly<ASTNode[]>) {

    const inst = new SeededASTNodeSpace(ASTNodes);
    return new Proxy(inst, {
      get: this.get
    });

  }

  // XXX: This is pretty hacky
  protected static get(inst: SeededASTNodeSpace, prop: string) {
    // Only intervent accessing ASTNode structure space info
    if (astNodeTypeStrings.includes(prop as any)) {
      return inst.getSeededASTNodeBase(prop as ASTNodeTypeString);
    } else {
      return (inst as any)[prop];
    }
  }

  protected getSeededASTNodeBase<T extends ASTNodeTypeString>(nodeType: T): any {
    assert(astNodeTypeStrings.includes(nodeType));

    // TODO: fix type error
    return () => {
      return [...(this.getPredefinedASTNodeSet(nodeType, undefined) as Set<ASTNode>)] as any;
    };
  }


}

function recRemoveLocInfo(node: ASTNode): ASTNode {
  return deepOmit(node, ['loc', 'range']) as ASTNode;
}

export class NewNodeGenerationContext {
  constructor(public readonly scopeInfo: ScopeInfo | undefined, public forLocation: CodeRange | undefined) {
  }
}
