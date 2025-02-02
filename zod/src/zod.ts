import {
  appendErrors,
  FieldError,
  FieldErrors,
  Resolver,
} from 'react-hook-form';
import { z, ZodError } from 'zod';
import { toNestErrors, validateFieldsNatively } from '@hookform/resolvers';

const isZodError = (error: any): error is ZodError => error.errors != null;

const parseErrorSchema = (
  zodErrors: z.ZodIssue[],
  validateAllFieldCriteria: boolean,
) => {
  const errors: Record<string, FieldError> = {};
  for (; zodErrors.length; ) {
    const error = zodErrors[0];
    const { code, message, path } = error;
    const _path = path.join('.');

    if (!errors[_path]) {
      if ('unionErrors' in error) {
        const unionError = error.unionErrors[0].errors[0];

        errors[_path] = {
          message: unionError.message,
          type: unionError.code,
        };
      } else {
        errors[_path] = { message, type: code };
      }
    }

    if ('unionErrors' in error) {
      error.unionErrors.forEach((unionError) =>
        unionError.errors.forEach((e) => zodErrors.push(e)),
      );
    }

    if (validateAllFieldCriteria) {
      const types = errors[_path].types;
      const messages = types && types[error.code];

      errors[_path] = appendErrors(
        _path,
        validateAllFieldCriteria,
        errors,
        code,
        messages
          ? ([] as string[]).concat(messages as string[], error.message)
          : error.message,
      ) as FieldError;
    }

    zodErrors.shift();
  }

  return errors;
};

type FactoryOptions = {
  /**
   * @default async
   */
  mode?: 'async' | 'sync';
  /**
   * Return the raw input values rather than the parsed values.
   * @default false
   */
  raw?: boolean;
}

export const zodResolver =
  <T extends z.ZodTypeAny>(
    schema: T,
    schemaOptions?: Partial<z.ParseParams>,
    factoryOptions?: FactoryOptions,
  ): Resolver<z.infer<T>> =>
  async (values, _, options) => {
    try {
      const data = await schema[
        factoryOptions?.mode === 'sync' ? 'parse' : 'parseAsync'
      ](values, schemaOptions);

      options.shouldUseNativeValidation && validateFieldsNatively({}, options);

      return {
        errors: {} as FieldErrors,
        values: factoryOptions?.raw ? values : data,
      };
    } catch (error: any) {
      if (isZodError(error)) {
        return {
          values: {},
          errors: toNestErrors(
            parseErrorSchema(
              error.errors,
              !options.shouldUseNativeValidation &&
                options.criteriaMode === 'all',
            ),
            options,
          ),
        };
      }

      throw error;
    }
  };
