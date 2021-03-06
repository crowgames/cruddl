import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    NoDuplicateTypesValidator,
    VALIDATION_ERROR_DUPLICATE_TYPE_NAMES
} from "../../../src/schema/preparation/ast-validation-modules/no-duplicate-types-validator";

const modelWithoutDuplicates = `
            type Stuff {
                foo: String
            }
        `;

const modelWithDuplicate = `
            type Stuff {
                foo: String
            }
            type Stuff {
                bar: String
            }
            type Stuff {
                name: String
            }
        `;

describe('no duplicate type definition validator', () => {
    it('finds duplicate types', () => {
        const ast = parse(modelWithDuplicate);
        const validationResult = new ValidationResult(new NoDuplicateTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        // we expect two errors because both types have a duplicate type error
        expect(validationResult.messages.length).toBe(3);
        expect(validationResult.messages[0].message).toBe(VALIDATION_ERROR_DUPLICATE_TYPE_NAMES);
    });

    it('accepts unique types', () => {
        const ast = parse(modelWithoutDuplicates);
        const validationResult = new ValidationResult(new NoDuplicateTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
