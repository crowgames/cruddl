/**
 *
 * This is kind of a query language definition, tailored for our use case. There is no string representation, but
 * the objects can "describe" themselves for a human-readable representation.
 *
 * A query tree specifies *what* is to be fetched and *how* the result should look like. Each query node results in
 * some kind of runtime value. Some nodes are evaluated with a *context value* which is then transitively passed through
 * the tree until a different context value is present. The context value can then be retrieved via ContextNode. This is
 * used for loop variables. It could also be used for any object (e.g. a ContextEstablishingQueryNode), but here, we
 * currently just repeat the node that evaluates to this object on every use.
 *
 * To specify an expression like this:
 *     users.filter(u => u.role == "admin").map(u => { name: u.fullName, age: u.age })
 * create the following query:
 *  EntitiesQueryNode {
 *    type: 'User'
 *    filterNode: BinaryOperationQueryNode { # gets each user as context
 *      lhs: FieldNode "role" # takes the context for field access
 *      operator: EQUALS
 *      rhs: LiteralNode "admin"
 *    }
 *    innerNode: ObjectQueryNode { # gets each user as context
 *      property "name": FieldNode "fullName"
 *      property "age": FieldNode "age"
 *    }
 *
 *
 */
import { GraphQLField, GraphQLObjectType } from 'graphql';
import { indent } from '../utils/utils';

export interface QueryNode {
    describe(): string;
}

/**
 * A node that evaluates to the current context value
 */
export class ContextQueryNode implements QueryNode {
    constructor() {
    }

    public describe() {
        return `context`;
    }
}

/**
 * A node that sets the context to the result of a node and evaluates to a second node
 */
export class ContextAssignmentQueryNode implements QueryNode {
    constructor(public readonly contextValueNode: QueryNode, public readonly resultNode: QueryNode) {
    }

    public describe() {
        return `let context = ${this.contextValueNode.describe()} in ${this.resultNode.describe()}`;
    }
}

/**
 * A node that evaluates to a predefined literal value
 */
export class LiteralQueryNode {
    constructor(public readonly value: any) {
    }

    public describe() {
        const json = this.value === undefined ? "undefined" : JSON.stringify(this.value);
        return `literal ${json.magenta}`;
    }
}

/**
 * A node that evaluates either to null
 */
export class NullQueryNode {
    public describe() {
        return `null`;
    }
}

/**
 * A node that evaluates either to true or to false
 */
export class ConstBoolQueryNode {
    constructor(public readonly value: boolean) {
    }

    public describe() {
        return `${!!this.value}`;
    }
}

/**
 * A node that evaluates to the value of a field of an object
 *
 * Note: this is unrelated to storing the value in a property of a result object, see ObjectQueryNode
 */
export class FieldQueryNode implements QueryNode {
    constructor(public readonly objectNode: QueryNode, public readonly field: GraphQLField<any, any>) {
    }

    public describe() {
        return `${this.objectNode.describe()}.${this.field.name.blue}`;
    }
}

/**
 * A node that evaluates in a JSON-like object structure with properties and values
 */
export class ObjectQueryNode implements QueryNode {
    constructor(public readonly properties: PropertySpecification[]) {

    }

    describe() {
        if (!this.properties.length) {
            return `{}`;
        }
        return `{\n` + indent(this.properties.map(p => p.describe()).join('\n')) + `\n}`;
    }
}

/**
 * Specifies one property of a an ObjectQueryNode
 */
export class PropertySpecification implements QueryNode {
    constructor(public readonly propertyName: string,
                public readonly valueNode: QueryNode) {

    }

    describe(): string {
        return `${JSON.stringify(this.propertyName).green}: ${this.valueNode.describe()}`;
    }
}

/**
 * A node that evaluates to a list with query nodes as list entries
 */
export class ListQueryNode implements QueryNode {
    constructor(public readonly itemNodes: QueryNode[]) {

    }

    describe(): string {
        if (!this.itemNodes.length) {
            return `[]`;
        }
        return `[\n` + indent(this.itemNodes.map(item => item.describe()).join(',\n')) + `\n]`;
    }
}

/**
 * A query that evaluates to true if a value is of a certain type, or false otherwise
 */
export class TypeCheckQueryNode implements QueryNode {
    constructor(public readonly valueNode: QueryNode, public type: BasicType) {

    }

    private describeType(type: BasicType) {
        switch (type) {
            case BasicType.OBJECT:
                return 'object';
            case BasicType.LIST:
                return 'list';
            case BasicType.SCALAR:
                return 'scalar';
            case BasicType.NULL:
                return 'null';
        }
    }

    describe(): string {
        return `(${this.valueNode.describe()} is of type ${this.describeType(this.type)})`;
    }
}

export enum BasicType {
    OBJECT,
    LIST,
    SCALAR,
    NULL
}

export class ConditionalQueryNode implements QueryNode {
    constructor(public readonly condition: QueryNode, public readonly expr1: QueryNode, public readonly expr2: QueryNode) {

    }

    describe() {
        return `(if ${this.condition.describe()} then ${this.expr1.describe()} else ${this.expr2.describe()} endif)`;
    }
}

/**
 * A node that performs an operation with one operand
 */
export class UnaryOperationQueryNode implements QueryNode {
    constructor(public readonly valueNode: QueryNode, public readonly operator: UnaryOperator) {

    }

    describe() {
        switch (this.operator) {
            case UnaryOperator.NOT:
                return `!(${this.valueNode.describe()})`;
            case UnaryOperator.JSON_STRINGIFY:
                return `JSON_STRINGIFY(${this.valueNode.describe()})`;
            default:
                return '(unknown operator)';
        }
    }
}

/**
 * The operator of a UnaryOperationQueryNode
 */
export enum UnaryOperator {
    NOT,
    JSON_STRINGIFY
}

/**
 * A node that performs an operation with two operands
 */
export class BinaryOperationQueryNode implements QueryNode {
    constructor(public readonly lhs: QueryNode, public readonly operator: BinaryOperator, public readonly rhs: QueryNode) {

    }

    describe() {
        return `(${this.lhs.describe()} ${this.describeOperator(this.operator)} ${this.rhs.describe()})`;
    }

    private describeOperator(op: BinaryOperator) {
        switch (op) {
            case BinaryOperator.AND:
                return '&&';
            case BinaryOperator.OR:
                return '&&';
            case BinaryOperator.EQUAL:
                return '==';
            case BinaryOperator.UNEQUAL:
                return '!=';
            case BinaryOperator.GREATER_THAN:
                return '>';
            case BinaryOperator.GREATER_THAN_OR_EQUAL:
                return '>=';
            case BinaryOperator.LESS_THAN:
                return '<';
            case BinaryOperator.LESS_THAN_OR_EQUAL:
                return '<=';
            case BinaryOperator.IN:
                return 'IN';
            case BinaryOperator.CONTAINS:
                return 'CONTAINS';
            case BinaryOperator.STARTS_WITH:
                return 'STARTS WITH';
            case BinaryOperator.ENDS_WITH:
                return 'ENDS WITH';
            default:
                return '(unknown operator)';
        }
    }
}

/**
 * The operator of a BinaryOperationQueryNode
 */
export enum BinaryOperator {
    AND,
    OR,
    EQUAL,
    UNEQUAL,
    LESS_THAN,
    LESS_THAN_OR_EQUAL,
    GREATER_THAN,
    GREATER_THAN_OR_EQUAL,
    IN,
    CONTAINS,
    STARTS_WITH,
    ENDS_WITH,
}

/**
 * A node that evaluates in the list of entities of a given type. use ListQueryNode to further process them
 */
export class EntitiesQueryNode implements QueryNode {
    constructor(public readonly objectType: GraphQLObjectType) {
    }

    describe() {
        return `entities of type ${this.objectType.name.blue}`;
    }
}

/**
 * A node to filter, order, limit and map a list
 *
 * If you use a ContextQueryNode in filterNode or in innerNode, they will evaluate to the corresponding list item value
 */
export class TransformListQueryNode implements QueryNode {
    constructor(params: { listNode: QueryNode, innerNode?: QueryNode, filterNode?: QueryNode, orderBy?: OrderSpecification, maxCount?: number }) {
        this.listNode = params.listNode;
        this.innerNode = params.innerNode || new ContextQueryNode();
        this.filterNode = params.filterNode || new ConstBoolQueryNode(true);
        this.orderBy = params.orderBy || new OrderSpecification([]);
        this.maxCount = params.maxCount;
    }

    public readonly listNode: QueryNode;
    public readonly innerNode: QueryNode;
    public readonly filterNode: QueryNode;
    public readonly orderBy: OrderSpecification;
    public readonly maxCount: number | undefined;

    describe() {
        return `${this.listNode.describe()} as list\n` +
            indent(`where ${this.filterNode.describe()}\norder by ${this.orderBy.describe()}${this.maxCount != undefined ? `\nlimit ${this.maxCount}` : ''}\nas ${this.innerNode.describe()}`);
    }
}

/**
 * A node that evaluates to the first item of a list
 */
export class FirstOfListQueryNode implements QueryNode {
    constructor(public readonly listNode: QueryNode) {
    }

    describe() {
        return `first of ${this.listNode.describe()}`;
    }
}

export class OrderClause {
    constructor(public readonly valueNode: QueryNode, public readonly direction: OrderDirection) {

    }

    private describeDirection(direction: OrderDirection) {
        if (direction == OrderDirection.DESCENDING) {
            return ` desc`;
        }
        return ``;
    }

    describe() {
        return `${this.valueNode.describe()}${this.describeDirection(this.direction)}`;
    }
}

export class OrderSpecification {
    constructor(public readonly clauses: OrderClause[]) {

    }

    isUnordered() {
        return this.clauses.length == 0;
    }

    describe() {
        if (!this.clauses.length) {
            return '(unordered)';
        }
        return this.clauses.map(c => c.describe()).join(', ');
    }
}

export enum OrderDirection {
    ASCENDING,
    DESCENDING
}

/**
 * A node that creates a new entity and evaluates to that new entity object
 */
export class CreateEntityQueryNode {
    constructor(public readonly objectType: GraphQLObjectType, public readonly objectNode: QueryNode) {

    }

    describe() {
        return `create ${this.objectType.name} entity with values ${this.objectNode.describe()}`;
    }
}

/**
 * A node that updates existing entities
 *
 * Existing properties of the entities will be kept when not specified in the updateNode. If a property is specified
 * in updates and in the existing entity, it will be replaced with the PropertySpecification's value. The entity
 * to-be-updated will however be available as *context* so you can still access the old value via a FieldQueryNode
 * and use e.g. an UpdateObjectQueryNode to only modify some properties.
 *
 * FOR doc
 * IN $collection(objectType)
 * FILTER $filterNode
 * UPDATE doc
 * WITH $updateNode [doc as context]
 * IN $collection(objectType)
 * OPTIONS { mergeObjects: false }
 *
 * The objectNode is evaluated in the context of the to-be-updated entity.
 */
export class UpdateEntitiesQueryNode {
    constructor(params: { objectType: GraphQLObjectType, filterNode: QueryNode, updates: PropertySpecification[], maxCount?: number }) {
        this.objectType = params.objectType;
        this.filterNode = params.filterNode;
        this.updates = params.updates;
        this.maxCount = params.maxCount;
    }

    public readonly objectType: GraphQLObjectType;
    public readonly filterNode: QueryNode;
    public readonly updates: PropertySpecification[];
    public readonly maxCount: number|undefined;

    describe() {
        return `update ${this.objectType.name} entities where ${this.filterNode.describe()} with values {\n` +
            indent(this.updates.map(p => p.describe()).join(',\n')) + `\n}`;
    }
}

/**
 * A node that deletes existing entities and evaluates to the entities before deletion
 */
export class DeleteEntitiesQueryNode {
    constructor(params: { objectType: GraphQLObjectType, filterNode: QueryNode, maxCount?: number }) {
        this.objectType = params.objectType;
        this.filterNode = params.filterNode;
        this.maxCount = params.maxCount;
    }

    public readonly objectType: GraphQLObjectType;
    public readonly filterNode: QueryNode;
    public readonly maxCount: number|undefined;

    describe() {
        return `delete ${this.objectType.name} entities where ${this.filterNode.describe()}`;
    }
}

/**
 * A node that is executed in the context of an existing object, can add or reassign properties, and then evaluates to
 * the object with new properties. Untouched properties are kept as-is. Properties can be "removed" by setting them
 * to null.
 *
 * This operation behaves like the {...objectSpread} operator in JavaScript, or the MERGE function in AQL.
 *
 * The *context* is set to *sourceNode* in the update nodes.
 *
 * The merge is NOT recursive. To update objects recursively, use an ObjectObjectQueryNode again as the value of a
 * PropertySpecification.
 */
export class UpdateObjectQueryNode implements QueryNode {
    constructor(public readonly sourceNode: QueryNode, public readonly updates: PropertySpecification[]) {

    }

    describe() {
        if (!this.updates.length) {
            return this.sourceNode.describe();
        }
        return `{\n` +
            indent('...' + this.sourceNode.describe()) + ', [using this as context in:]\n' +
            indent(this.updates.map(p => p.describe()).join(',\n')) + `\n}`;
    }
}

/**
 * A node that concatenates multiple lists and evaluates to the new list
 *
 * This can be used to append items to an array by using a ListQueryNode as second item
 */
export class ConcatListsQueryNode implements QueryNode {
    constructor(public readonly listNodes: QueryNode[]) {

    }

    describe() {
        if (!this.listNodes.length) {
            return `[]`;
        }
        return `[\n` +
            this.listNodes.map(node => indent('...' + node.describe())).join(',\n') +
            `]`;
    }
}
