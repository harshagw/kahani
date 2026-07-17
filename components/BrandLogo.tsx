import Image from "next/image";

/** Shared Kahani brand mark for auth and landing surfaces. */
export function BrandLogo({
  size = 60,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/kahani-logo.png"
      alt="Kahani"
      width={size}
      height={size}
      priority
      className={className}
    />
  );
}