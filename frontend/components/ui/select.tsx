/**
 * The app's one picker: beUI's `motion/select` listbox, re-exported under the
 * names form fields already import. A form field, a toolbar filter and a
 * page-size control now share the same surface, the same keyboard behaviour and
 * the same panel animation, and no surface reaches for the platform picker.
 *
 * The value is a `string` and the change is `onValueChange(value)`: a picker no
 * longer carries a native `change` event, `name` or `required`. A form that has
 * to send the value keeps it in the same state the handler writes and puts it in
 * the request payload, which is what the call sites did in practice.
 *
 * The caption of a form field is an external `<Label htmlFor>`; the trigger
 * takes that `id`, so the visible caption names the real button.
 */
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type SelectContentProps,
  type SelectItemProps,
  type SelectProps,
  type SelectTriggerProps,
  type SelectValueProps,
} from "../motion/select";
