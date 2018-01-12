import {
    ConditionalQueryNode, ListQueryNode, ObjectQueryNode, PropertySpecification, QueryNode, RuntimeErrorQueryNode,
    TransformListQueryNode, VariableAssignmentQueryNode
} from '../query/definition';
import { VisitAction, visitObject } from '../utils/visitor';
import { error } from 'util';

/**
 * Moves RuntimeErrorQueryNodes up to its their deepest ancestor that is an output node, i.e., its value directly occurs
 * as a value within the query result
 */
export function moveErrorsToOutputNodes(queryTree: QueryNode): QueryNode {
    let errorList: RuntimeErrorQueryNode[] = [];
    type StackFrame = {
        clazz: Function,
        isOutputNode: boolean
    }
    const stack: StackFrame[] = [];

    return visitObject(queryTree, {
        enter(node: QueryNode, key: string): QueryNode|VisitAction {
            if (!(node instanceof QueryNode)) {
                return VisitAction.SKIP_NODE;
            }
            if (node instanceof RuntimeErrorQueryNode) {
                errorList.push(node);
            }
            if (!stack.length) {
                stack.push({
                    clazz: node.constructor,
                    isOutputNode: true
                });
            } else {
                const parentFrame = stack[stack.length - 1];
                const isOutputNode = parentFrame.isOutputNode && outputNodes.isOutputNode(parentFrame.clazz, key);
                stack.push({
                    clazz: node.constructor,
                    isOutputNode
                });
            }
            return node;
        },

        leave(node: QueryNode, key: string) {
            const frame = stack.pop();
            if (frame && frame.isOutputNode && errorList.length) {
                const errors = errorList;
                errorList = [];
                if (errors.length == 1) {
                    return errors[0];
                } else {
                    return new RuntimeErrorQueryNode(errors.map(err => err.message).join(', '))
                }
            }
            return node;
        }
    });
}

namespace outputNodes {
    const map = new Map<Function, Set<string>>();

    function add<T>(clazz: {new(...a: any[]): T}, ...fields: (keyof T)[]) {
        map.set(clazz, new Set(fields));
    }

    /**
     * Determines if a field of a node is an output value, assuming the parent node is an output value, too
     *
     * For example, the valueNode of a propertySpecification is an output node, while the filterNode of a list
     * transformation is not
     *
     * @param clazz the class of the parent node
     * @param fieldName the field name of the node to check within its parent class
     * @returns true, if the child node is an output node, false otherwise
     */
    export function isOutputNode(clazz: Function, fieldName: string) {
        const set = map.get(clazz);
        if (!set) {
            return false;
        }
        return set.has(fieldName);
    }

    add(VariableAssignmentQueryNode, 'resultNode');
    add(ObjectQueryNode, 'properties');
    add(PropertySpecification, 'valueNode');
    add(ListQueryNode, 'itemNodes');
    add(ConditionalQueryNode, 'expr1', 'expr2');
    add(TransformListQueryNode, 'innerNode');
}
