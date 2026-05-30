import { Select } from 'radix-ui'
import styles from './CountrySelect.module.css'

// Only suppliers with a registered private key can sign, so the picker is sourced from
// GET /api/suppliers (filtered upstream). Ids are shown in mono — they are crypto data.
export default function SupplierSelect({ suppliers = [], value, onChange, id }) {
  return (
    <Select.Root value={value || undefined} onValueChange={onChange}>
      <Select.Trigger className={styles.trigger} id={id} aria-label="Supplier">
        <Select.Value placeholder="Select a supplier" />
        <Select.Icon className={styles.caret}>▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className={styles.content} position="popper" sideOffset={6}>
          <Select.Viewport className={styles.viewport}>
            {suppliers.map((s) => (
              <Select.Item key={s.supplier_id} value={s.supplier_id} className={styles.item}>
                <Select.ItemText>
                  <span className="mono">{s.supplier_id}</span>
                </Select.ItemText>
                <Select.ItemIndicator className={styles.indicator} />
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
