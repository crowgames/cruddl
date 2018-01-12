import { getPermissionDescriptor } from '../permission-descriptors-in-schema';
import { AccessOperation, AuthContext } from '../auth-basics';
import {
    FieldQueryNode, FollowEdgeQueryNode, QueryNode, RuntimeErrorQueryNode, TransformListQueryNode, VariableQueryNode
} from '../../query/definition';
import { PermissionResult } from '../permission-descriptors';
import { invertRelationFieldEdgeSide } from '../../schema/edges';

export function transformFollowEdgeQueryNode(node: FollowEdgeQueryNode, authContext: AuthContext): QueryNode {
    const sourceType = node.edgeType.getTypeOfSide(node.sourceFieldSide);
    const sourceField = node.edgeType.getFieldOfSide(node.sourceFieldSide);
    if (!sourceField) {
        throw new Error(`Encountered FollowEdgeQueryNode which traverses via non-existing inverse field (on ${sourceType.name})`);
    }
    const fieldPermissionDescriptor = getPermissionDescriptor(sourceType, sourceField);
    const access = fieldPermissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`Not authorized to read ${sourceType.name}.${sourceField.name}`);
        case PermissionResult.CONDITIONAL:
            throw new Error(`Permission profiles with accessGroup restrictions are currently not supported on fields, but used in ${sourceType.name}.${sourceField.name}`);
    }

    const targetType = node.edgeType.getTypeOfSide(invertRelationFieldEdgeSide(node.sourceFieldSide));
    const entityPermissionDescriptor = getPermissionDescriptor(targetType);
    const entityAccess = entityPermissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (entityAccess) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`Not authorized to read ${targetType.name} objects by following ${sourceType.name}.${sourceField.name}`);
        default:
            const accessGroupField = targetType.getFields()['accessGroup'];
            if (!accessGroupField) {
                throw new Error(`Root entity ${targetType.name} has an accessGroup-based permission profile, but no accessGroup field`);
            }
            const itemVar = new VariableQueryNode('item');
            const accessGroupNode = new FieldQueryNode(itemVar, accessGroupField, targetType);
            const condition = entityPermissionDescriptor.getAccessCondition(authContext, AccessOperation.READ, accessGroupNode);
            return new TransformListQueryNode({
                listNode: node,
                filterNode: condition,
                itemVariable: itemVar
            });
    }
}
