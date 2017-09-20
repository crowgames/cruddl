import {
    SelectionSetNode,
    FieldNode,
    DirectiveNode,
    GraphQLSkipDirective,
    GraphQLIncludeDirective,
    GraphQLDirective,
    GraphQLField, FragmentDefinitionNode
} from "graphql";

// This function is not exported, but we really need this to not duplicate a large chunk of graphql-js
export const getArgumentValues: (def: GraphQLField<any, any> | GraphQLDirective,
                          node: FieldNode | DirectiveNode,
                          variableValues: {[key: string]: any}) => {[key: string]: any|undefined}
    = require('graphql/execution/values').getArgumentValues;

/**
 * Collects all fields selected by the given selection node
 *
 * For field nodes, this is just the field node
 * For fragments, this is all the fields requested by the fragment (recursively)
 *
 * This is basically the same as graphql-js' collectFields()
 * https://github.com/graphql/graphql-js/blob/d052f6597b88eae1c06b3c9a7c74434878dde902/src/execution/execute.js#L406
 *
 * We need to duplicate the logic here because graphql-js only supports pulling fields one after the other via the
 * resolve callbacks, but we need to build the whole query structure before any data has been resolved
 */
export function resolveSelections(selectionSetNode: SelectionSetNode, context: {
    variableValues: {[key: string]: any},
    fragments: {[key: string]: FragmentDefinitionNode|undefined}
}): FieldNode[] {
    const visitedFragmentNames = new Set<string>();
    const nodes: FieldNode[] = [];

    function walk(selectionSetNode: SelectionSetNode) {
        for (const selection of selectionSetNode.selections) {
            // Here,
            if (!shouldIncludeNode(selection.directives || [], context.variableValues)) {
                continue;
            }

            switch (selection.kind) {
                case 'Field':
                    nodes.push(selection);
                    break;
                case 'InlineFragment':
                    walk(selection.selectionSet);
                    break;
                case 'FragmentSpread':
                    const fragmentName = selection.name.value;
                    if (visitedFragmentNames.has(fragmentName)) {
                        continue;
                    }
                    visitedFragmentNames.add(fragmentName);
                    const fragment = context.fragments[fragmentName];
                    if (!fragment) {
                        throw new Error(`Fragment ${fragmentName} was queried but not defined`);
                    }
                    walk(fragment.selectionSet);
                    break;
            }
        }
        return nodes;
    }

    return walk(selectionSetNode);
}

/**
 * Determines if a FieldNode should be included based on its directives
 *
 * Copied from (slightly modified):
 * https://github.com/graphql/graphql-js/blob/d052f6597b88eae1c06b3c9a7c74434878dde902/src/execution/execute.js#L472
 *
 *
 * @param directives the directives of the field node
 * @param variableValues variables supplied to the query
 * @returns true if the node should be included, false if it should be skipped
 */
function shouldIncludeNode(directives: DirectiveNode[], variableValues: {[key: string]: any}) {
    const skipNode = directives.find(d => d.name.value == GraphQLSkipDirective.name);
    if (skipNode) {
        const {if: skipIf} = getArgumentValues(
            GraphQLSkipDirective,
            skipNode,
            variableValues
        );
        if (skipIf === true) {
            return false;
        }
    }

    const includeNode = directives.find(d => d.name.value == GraphQLIncludeDirective.name);
    if (includeNode) {
        const {if: includeIf} = getArgumentValues(
            GraphQLIncludeDirective,
            includeNode,
            variableValues
        );
        if (includeIf === false) {
            return false;
        }
    }

    return true;
}