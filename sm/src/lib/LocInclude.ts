/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import { CodeRange } from 'solidity-parser-antlr';
import { cmpLineColumn } from './utils';

export default function locInclude(loc: CodeRange, inLoc: CodeRange): boolean {

    return cmpLineColumn(loc.start, inLoc.start) >= 0 && cmpLineColumn(loc.end, inLoc.end) <= 0;

}