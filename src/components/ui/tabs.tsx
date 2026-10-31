"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex min-w-0 max-w-full gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit max-w-full items-center justify-center rounded-surface p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
      /**
       * The tabs may wrap onto several lines (a phone, a long Arabic label). The base class
       * fixes the height at 36 px under a group-data modifier, and a page's own `h-auto`
       * does NOT remove it: tailwind-merge only drops a class with the same modifiers, and
       * the group-data selector is the more specific one. So the list stayed 36 px while its
       * tabs ran past it onto the search box below (360 px: /orders 83 px, /risk 29 px,
       * /deliveries 25 px). `wrap` swaps the height under the SAME modifier, so the list
       * grows with its lines. A page asks for it with the prop, never with classes.
       *
       * Two things keep the one-line look exactly as it was: `min-h-9` is the old floor,
       * and the tabs keep their old height (see TabsTrigger). Without them the tabs take
       * the height of their content, and Arabic's taller line box makes the list 39 px.
       */
      wrap: {
        true: "min-h-9 flex-wrap gap-y-0.5 group-data-[orientation=horizontal]/tabs:h-auto",
        false: "",
      },
      /**
       * The tabs may not fit and are reached by swiping (a phone, a long French or Arabic label).
       * Two things went wrong without this, both measured in Chromium:
       *  - /automations: the line list let its tabs run out of the page, where the page clips them
       *    (the Activity tab 67 percent visible in English at 360 px, 5 percent in French at 320).
       *  - /storefronts: the list scrolled, but its own scroll box clipped the active-tab underline
       *    (drawn 5 px under the tab). A scroll box clips at its padding edge, 1 px above the list
       *    border, so with a mouse 1 of the 2 pixel rows was lost; with a finger a tab is a button and
       *    globals.css makes buttons at least 44 px tall on a coarse pointer, so the tab stuck out of
       *    the 36 px list and the whole underline was outside the box.
       * `scroll` swaps the fixed height for auto under the SAME modifier (the list grows to its tabs,
       * 36 px stays the floor), clips only sideways, and leaves 4 px under the tabs for the underline.
       * A page asks with the prop, never with classes.
       */
      scroll: {
        true: "min-h-9 overflow-x-auto overflow-y-hidden pb-1 group-data-[orientation=horizontal]/tabs:h-auto",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      wrap: false,
      scroll: false,
    },
  }
)

function TabsList({
  className,
  variant = "default",
  wrap = false,
  scroll = false,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      data-wrap={wrap ? "true" : undefined}
      data-scroll={scroll ? "true" : undefined}
      className={cn(tabsListVariants({ variant, wrap, scroll }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  linksToPage = false,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  /**
   * The tab is a link to a page that is rendered again, so no panel with Radix's generated
   * id exists in the document. Set this instead of passing `aria-controls={undefined}` from
   * a server page: React drops undefined props at the server/client boundary, so Radix
   * would keep the default and axe (aria-valid-attr-value) fails the selected tab.
   */
  linksToPage?: boolean
}) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-control border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // A wrapping list has no fixed height, so 100% above would turn into the content height.
        // 2.25rem (the old list) minus its 6 px padding and 1 px = the 29 px a tab always had.
        "group-data-[wrap=true]/tabs-list:h-[calc(2.25rem-7px)]",
        // A scrolling list has no fixed height either. 28 px = what a tab had in the fixed line list; a finger
        // still gets 44 px because globals.css sets a min-height on buttons, and the list grows to hold it.
        // The tabs must not shrink: a scroll box only helps when the tabs keep their width.
        "group-data-[scroll=true]/tabs-list:h-7 group-data-[scroll=true]/tabs-list:flex-none",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-end-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
      {...(linksToPage ? { "aria-controls": undefined } : null)}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
