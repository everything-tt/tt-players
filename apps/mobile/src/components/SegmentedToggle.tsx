// Delegate to the design-system SegmentedToggle. Kept as a thin re-export so
// existing import paths (`./components/SegmentedToggle`) keep working; new code
// should import from `./ui/appkit` directly.
export { SegmentedToggle, type SegmentedToggleOption, type SegmentedToggleProps } from '../ui/appkit';
