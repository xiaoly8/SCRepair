/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import assert from 'assert';
import { InterestedSpace, InterestedLocation, InterestedContract, InterestedNodeType, ConjunctInterestedSpace } from './InterestedSpace/InterestedSpace';
import { ASTNode, ASTNodeTypeString } from 'solidity-parser-antlr';

export default function InterestedSpaceSpecifierParser(_ast: ASTNode, interested_space_specifier: string | undefined): InterestedSpace[] | undefined {
    // Transform interested_space_specifier

    if (interested_space_specifier === undefined) {
        // All possible spaces are interested
        return undefined;
    } else {

        const rst: Exclude<ReturnType<typeof InterestedSpaceSpecifierParser>, undefined> = [];

        for (const specifier of interested_space_specifier.split(';').map((x) => x.trim())) {

            if (specifier.length === 0) {
                continue;
            }

            let specifier_: string = specifier;

            const begin_nodeTypeSpecifier = 'TYPE:';
            const begin_locationalSpecifier = 'LOC:';

            function processContractSpecifier(specifier_: string) {
                const arr = specifier_.trim().split('.');
                if (arr.length === 1 || arr[1] === '*') {
                    return new InterestedContract(arr[0], null);
                } else {

                    const functionName = arr[1] !== '(fallback)' ? arr[1] : '';

                    return new InterestedContract(arr[0], [functionName]);
                }
            }
            function processNodeTypeSpecifier(specifier_: string) {
                const nodeType_specifier = specifier_.trim().slice(begin_nodeTypeSpecifier.length) as ASTNodeTypeString;
                const parts = nodeType_specifier.split('-');
                assert(parts.length >= 1 && parts.length <= 2, `malformed NodeType specifier`);

                const interestedNodeType = new InterestedNodeType(parts[parts.length - 1] as any);

                if (parts.length === 2) {
                    const interestedContract = processContractSpecifier(parts[0]);
                    return new ConjunctInterestedSpace(interestedContract, interestedNodeType);
                } else {
                    return interestedNodeType;
                }
            }

            function processLocationalSpecifier(specifier_: string) {
                const location_specifier = specifier_.slice(begin_locationalSpecifier.length);
                const [start_specifier, end_specifier] = location_specifier.split('-').map((x) => x.trim());

                const [start_line, start_col] = start_specifier.split(',') as [string, string | undefined];
                const [end_line, end_col] = end_specifier.split(',') as [string, string | undefined];

                return new InterestedLocation({
                    start: {
                        line: parseInt(start_line),
                        column: start_col !== undefined ? parseInt(start_col) : 0,
                    },
                    end: {
                        line: parseInt(end_line),
                        column: end_col !== undefined ? parseInt(end_col) : Infinity,
                    }
                });
            }

            if (specifier_.startsWith(begin_nodeTypeSpecifier)) {
                rst.push(processNodeTypeSpecifier(specifier_));
            }
            else if (specifier_.startsWith(begin_locationalSpecifier)) {
                rst.push(processLocationalSpecifier(specifier_));

            } else {
                rst.push(processContractSpecifier(specifier_));
            }

        }

        return rst;
    }
}