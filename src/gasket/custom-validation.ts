import { insist } from './core'
import { isDate } from './dates'
export const CUSTOM_TYPES = ['text', 'number', 'single', 'multiple', 'date', 'boolean', 'link'] as const
export interface CustomField {
  id: string; name: string; entity_type: string; type: string; scope: string; category: string | null;
  required: number; options: string | null; unit: string | null; minimum: number | null; maximum: number | null; retired: number; revision: number
}
export function validateCustomValue(field: CustomField, value: unknown): string | number | boolean | string[] | null {
  if (typeof value === 'string') value = value.trim()
  if (field.type === 'multiple' && typeof value === 'string') value = value.split(',').map(s => s.trim()).filter(Boolean)
  const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  insist(!empty || !field.required, 'custom_value_required', 400, { field: field.id, name: field.name })
  if (empty) return null
  const choices: string[] = field.options ? JSON.parse(field.options) : []
  switch (field.type) {
    case 'number': {
      insist(typeof value === 'number' || (typeof value === 'string' && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)), 'invalid_custom_number')
      const number = Number(value)
      insist(Number.isFinite(number) && (field.minimum === null || number >= field.minimum) && (field.maximum === null || number <= field.maximum), 'custom_number_range')
      return number
    }
    case 'single': insist(typeof value === 'string' && choices.includes(value), 'invalid_custom_choice'); return value
    case 'multiple': {
      const values = typeof value === 'string' ? value.split(',').map(s => s.trim()).filter(Boolean) : value
      insist(Array.isArray(values) && values.every(v => typeof v === 'string' && choices.includes(v)), 'invalid_custom_choice')
      return [...new Set(values)]
    }
    case 'boolean': insist([true, false, 'yes', 'no'].includes(value as any), 'invalid_custom_boolean'); return value === true || value === 'yes'
    case 'date': insist(typeof value === 'string' && isDate(value), 'invalid_custom_date'); return value
    case 'link': {
      insist(typeof value === 'string' && value.length <= 2000, 'invalid_custom_link')
      let url: URL | undefined; try { url = new URL(value) } catch {}
      insist(url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password, 'invalid_custom_link')
      return value
    }
    default: insist(typeof value === 'string' && value.length <= 2000, 'invalid_custom_text'); return value.trim()
  }
}
