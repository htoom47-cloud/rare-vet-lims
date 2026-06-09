export default function AppLogo({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
  };

  return (
    <img
      src="/logo.png"
      alt="مركز رعاية النوادر البيطري"
      className={`${sizes[size] || sizes.md} object-contain ${className}`}
    />
  );
}
