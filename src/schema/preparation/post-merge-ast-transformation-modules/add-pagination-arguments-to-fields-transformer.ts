import {ASTTransformer} from "../transformation-pipeline";
import {DocumentNode, GraphQLInt, GraphQLString} from 'graphql';
import {
    buildNameNode,
    getNamedTypeDefinitionAST,
    getObjectTypes,
    getTypeNameIgnoringNonNullAndList,
    hasDirectiveWithName
} from "../../schema-utils";
import {
    INPUT_VALUE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from "../../../graphql/kinds";
import {AFTER_ARG, FIRST_ARG, VALUE_OBJECT_DIRECTIVE} from '../../schema-defaults';

export class AddPaginationArgumentsToFieldsTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getObjectTypes(ast).forEach(objectType => {
            objectType.fields.forEach(field => {
                // Only lists have pagination args
                if (field.type.kind !== LIST_TYPE && !(field.type.kind === NON_NULL_TYPE && field.type.type.kind === LIST_TYPE)) {
                    return;
                }
                const resolvedType = getNamedTypeDefinitionAST(ast, getTypeNameIgnoringNonNullAndList(field.type));
                // if this field is of an object type (only object types can have a _cursor field, so pagination only makes sense for them)
                if (resolvedType.kind === OBJECT_TYPE_DEFINITION && !hasDirectiveWithName(resolvedType, VALUE_OBJECT_DIRECTIVE)) {
                    field.arguments.push({
                        kind: INPUT_VALUE_DEFINITION,
                        name: buildNameNode(FIRST_ARG),
                        type: { kind: NAMED_TYPE,  name: buildNameNode(GraphQLInt.name)}
                    },{
                        kind: INPUT_VALUE_DEFINITION,
                        name: buildNameNode(AFTER_ARG),
                        type: { kind: NAMED_TYPE,  name: buildNameNode(GraphQLString.name)}
                    });
                }
            })
        })
    }

}