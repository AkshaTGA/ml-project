import field from '../assets/farm-field.jpg'

/** Real field photograph. Decorative only. */
export function FarmScene({ className = '' }) {
  return (
    <img
      src={field}
      alt=""
      className={`size-full object-cover object-[center_62%] ${className}`}
    />
  )
}
