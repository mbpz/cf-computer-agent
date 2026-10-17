// The app's single Card, rendered by beUI's `motion/card`, so one surface and
// one radius carry every panel in the product. The part names, the part props
// and the padding contract are unchanged, which keeps all importers untouched:
// the beUI source owns the variant/size/interactive API, the data-slots and the
// press feedback, and the adapter is a plain re-export because this surface adds
// no guarantee on top of it.
export {
  CARD_TARGET_CLASS,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  type CardActionProps,
  type CardContentProps,
  type CardDescriptionProps,
  type CardFooterProps,
  type CardHeaderProps,
  type CardProps,
  type CardSize,
  type CardTitleProps,
  type CardVariant,
} from "../motion/card";
