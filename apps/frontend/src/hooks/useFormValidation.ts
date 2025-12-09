'use client';

import { useState, useCallback, useMemo } from 'react';
import { z } from 'zod';

/**
 * Field validation state.
 */
interface FieldState {
  value: string;
  error: string | null;
  touched: boolean;
  valid: boolean;
}

/**
 * Form validation state.
 */
interface FormState<T extends Record<string, string>> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isValid: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
}

/**
 * Hook for form validation with real-time feedback.
 *
 * @example
 * ```tsx
 * const { values, errors, touched, handleChange, handleBlur, handleSubmit, isValid } = useFormValidation({
 *   initialValues: { email: '', password: '' },
 *   schema: z.object({
 *     email: z.string().email(),
 *     password: z.string().min(8),
 *   }),
 *   onSubmit: async (values) => {
 *     await api.auth.login(values);
 *   },
 * });
 * ```
 */
export function useFormValidation<T extends Record<string, string>>({
  initialValues,
  schema,
  onSubmit,
  validateOnChange = true,
  validateOnBlur = true,
}: {
  initialValues: T;
  schema: z.ZodType<T>;
  onSubmit: (values: T) => Promise<void>;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Validate a single field
  const validateField = useCallback(
    (name: keyof T, value: string): string | null => {
      try {
        // Safely access shape if available (for ZodObject)
        const schemaAny = schema as any;
        const fieldSchema = schemaAny.shape ? schemaAny.shape[name] : null;
        if (fieldSchema) {
          fieldSchema.parse(value);
        }
        return null;
      } catch (error) {
        if (error instanceof z.ZodError) {
          return error.errors[0]?.message || 'Invalid value';
        }
        return 'Validation error';
      }
    },
    [schema]
  );

  // Validate all fields
  const validateAll = useCallback((): boolean => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return true;
    }

    const newErrors: Partial<Record<keyof T, string>> = {};
    for (const error of result.error.errors) {
      const path = error.path[0] as keyof T;
      if (!newErrors[path]) {
        newErrors[path] = error.message;
      }
    }
    setErrors(newErrors);
    return false;
  }, [schema, values]);

  // Handle input change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setValues((prev) => ({ ...prev, [name]: value }));

      if (validateOnChange && touched[name as keyof T]) {
        const error = validateField(name as keyof T, value);
        setErrors((prev) => ({ ...prev, [name]: error || undefined }));
      }

      setSubmitError(null);
    },
    [validateOnChange, touched, validateField]
  );

  // Handle input blur
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setTouched((prev) => ({ ...prev, [name]: true }));

      if (validateOnBlur) {
        const error = validateField(name as keyof T, value);
        setErrors((prev) => ({ ...prev, [name]: error || undefined }));
      }
    },
    [validateOnBlur, validateField]
  );

  // Set a specific field value programmatically
  const setFieldValue = useCallback(
    (name: keyof T, value: string) => {
      setValues((prev) => ({ ...prev, [name]: value }));
      if (validateOnChange) {
        const error = validateField(name, value);
        setErrors((prev) => ({ ...prev, [name]: error || undefined }));
      }
    },
    [validateOnChange, validateField]
  );

  // Set a specific field error
  const setFieldError = useCallback((name: keyof T, error: string | null) => {
    setErrors((prev) => ({ ...prev, [name]: error || undefined }));
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      // Mark all fields as touched
      const allTouched = Object.keys(values).reduce(
        (acc, key) => ({ ...acc, [key]: true }),
        {} as Record<keyof T, boolean>
      );
      setTouched(allTouched);

      // Validate all fields
      if (!validateAll()) {
        return;
      }

      setIsSubmitting(true);
      setSubmitError(null);

      try {
        await onSubmit(values);
      } catch (err: any) {
        setSubmitError(err.message || 'Submission failed');
      } finally {
        setIsSubmitting(false);
      }
    },
    [values, validateAll, onSubmit]
  );

  // Reset form to initial values
  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
    setSubmitError(null);
  }, [initialValues]);

  // Computed states
  const isValid = useMemo(() => {
    return Object.keys(errors).length === 0 && schema.safeParse(values).success;
  }, [errors, schema, values]);

  const isDirty = useMemo(() => {
    return Object.keys(values).some(
      (key) => values[key as keyof T] !== initialValues[key as keyof T]
    );
  }, [values, initialValues]);

  // Get field props helper
  const getFieldProps = useCallback(
    (name: keyof T) => ({
      name,
      value: values[name],
      onChange: handleChange,
      onBlur: handleBlur,
      'aria-invalid': !!errors[name],
      'aria-describedby': errors[name] ? `${String(name)}-error` : undefined,
    }),
    [values, errors, handleChange, handleBlur]
  );

  // Get field state helper
  const getFieldState = useCallback(
    (name: keyof T): FieldState => ({
      value: values[name],
      error: errors[name] || null,
      touched: !!touched[name],
      valid: !errors[name] && !!touched[name],
    }),
    [values, errors, touched]
  );

  return {
    values,
    errors,
    touched,
    isValid,
    isDirty,
    isSubmitting,
    submitError,
    handleChange,
    handleBlur,
    handleSubmit,
    setFieldValue,
    setFieldError,
    getFieldProps,
    getFieldState,
    reset,
    validateField,
    validateAll,
  };
}

/**
 * Password strength indicator.
 */
export function usePasswordStrength(password: string) {
  return useMemo(() => {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    };

    const score = Object.values(checks).filter(Boolean).length;
    const strength = score <= 2 ? 'weak' : score <= 4 ? 'medium' : 'strong';

    return {
      checks,
      score,
      strength,
      percentage: (score / 5) * 100,
    };
  }, [password]);
}

/**
 * Common validation schemas.
 */
export const validationSchemas = {
  email: z.string().email('Please enter a valid email address'),
  
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),
  
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be at most 50 characters'),
  
  channelName: z
    .string()
    .min(2, 'Channel name must be at least 2 characters')
    .max(50, 'Channel name must be at most 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Channel name can only contain lowercase letters, numbers, and hyphens'),
  
  url: z.string().url('Please enter a valid URL'),
};
