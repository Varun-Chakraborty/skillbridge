import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const buttonVariantsBase = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 font-bold transition-[transform,background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        ink: "bg-foreground text-background hover:bg-foreground/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border-2 border-border bg-card text-card-foreground hover:border-foreground",
        ghost: "text-foreground hover:bg-muted",
        grape: "bg-feature text-feature-foreground hover:bg-feature/90",
      },
      size: {
        default: "h-10 rounded-full px-4 text-sm",
        sm: "h-9 rounded-full px-3 text-xs",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

/**
 * Merges the override classes through tailwind-merge before returning.
 *
 * cva only concatenates, so a caller passing `className` to override the variant
 * ends up with both sets in the attribute -- `bg-card text-card-foreground` from
 * outline *and* the `bg-transparent text-background` meant to replace it. Which
 * one paints is then decided by stylesheet order, not by anything the caller
 * declared, and that flips between the light and dark builds. Merging here keeps
 * the guarantee at the one place every call site already goes through.
 */
function buttonVariants({
  className,
  variant,
  size,
}: VariantProps<typeof buttonVariantsBase> & { className?: string } = {}): string {
  return cn(buttonVariantsBase({ variant, size, className }));
}

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariantsBase>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      // base-ui allows className to be a state function, so the variant classes
      // have to be merged inside it rather than alongside it.
      className={(state) =>
        buttonVariants({
          variant,
          size,
          className: typeof className === "function" ? className(state) : className,
        })
      }
      {...props}
    />
  );
}

export { Button, buttonVariants };
