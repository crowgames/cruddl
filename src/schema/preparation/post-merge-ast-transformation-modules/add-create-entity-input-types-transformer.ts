import {ASTTransformer} from '../transformation-pipeline';
import {
    DocumentNode,
    FieldDefinitionNode,
    GraphQLID,
    InputObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    ObjectTypeDefinitionNode,
    TypeNode
} from 'graphql';
import {
    findDirectiveWithName,
    getChildEntityTypes,
    getNamedTypeDefinitionAST,
    getRootEntityTypes,
    hasDirectiveWithName
} from '../../schema-utils';
import {
    INPUT_OBJECT_TYPE_DEFINITION,
    LIST_TYPE,
    NAMED_TYPE,
    NON_NULL_TYPE,
    OBJECT_TYPE_DEFINITION
} from '../../../graphql/kinds';
import {getCreateInputTypeName} from '../../../graphql/names';
import {
    ENTITY_CREATED_AT, ENTITY_UPDATED_AT, ID_FIELD, RELATION_DIRECTIVE, ROLES_DIRECTIVE
} from '../../schema-defaults';
import {
    buildInputFieldFromNonListField,
    buildInputValueListNodeFromField
} from './add-input-type-transformation-helper-transformer';
import { compact } from '../../../utils/utils';

export class AddCreateEntityInputTypesTransformer implements ASTTransformer {

    transform(ast: DocumentNode): void {
        getRootEntityTypes(ast).forEach(objectType => {
            ast.definitions.push(this.createCreateInputTypeForObjectType(ast, objectType));
        });
        getChildEntityTypes(ast).forEach(objectType => {
            ast.definitions.push(this.createCreateInputTypeForObjectType(ast, objectType));
        });
    }

    protected createCreateInputTypeForObjectType(ast: DocumentNode, objectType: ObjectTypeDefinitionNode): InputObjectTypeDefinitionNode {
        // create input fields for all entity fields except ID, createdAt, updatedAt
        const skip = [ID_FIELD, ENTITY_CREATED_AT, ENTITY_UPDATED_AT];
        const args = [
            ...objectType.fields.filter(field => !skip.includes(field.name.value)).map(field => this.createInputTypeField(ast, field, field.type))
        ];
        return {
            kind: INPUT_OBJECT_TYPE_DEFINITION,
            name: { kind: "Name", value: getCreateInputTypeName(objectType) },
            fields: args,
            loc: objectType.loc,
            directives: compact([ findDirectiveWithName(objectType, ROLES_DIRECTIVE) ])
        }
    }

    protected createInputTypeField(ast: DocumentNode, field: FieldDefinitionNode, type: TypeNode): InputValueDefinitionNode {
        switch (type.kind) {
            case NON_NULL_TYPE:
                return this.createInputTypeField(ast, field, type.type);
            case NAMED_TYPE:
                return buildInputFieldFromNonListField(ast, field, type);
            case LIST_TYPE:
                const effectiveType = type.type.kind === NON_NULL_TYPE ? type.type.type : type.type;
                if (effectiveType.kind === LIST_TYPE) {
                    throw new Error('Lists of lists are not allowed.');
                }
                const namedTypeOfList = getNamedTypeDefinitionAST(ast, effectiveType.name.value);
                if (namedTypeOfList.kind === OBJECT_TYPE_DEFINITION) {
                    // relations are referenced via IDs
                    if (hasDirectiveWithName(field, RELATION_DIRECTIVE)) {
                        return buildInputValueListNodeFromField(field.name.value, GraphQLID.name, field)
                    }
                    return buildInputValueListNodeFromField(field.name.value, getCreateInputTypeName(namedTypeOfList), field)
                } else {
                    return buildInputValueListNodeFromField(field.name.value, effectiveType.name.value, field);
                }
        }
    }

}


