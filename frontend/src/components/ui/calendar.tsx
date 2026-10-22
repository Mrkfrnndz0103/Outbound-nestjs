import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@/lib/utils";

function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "space-y-4",
        month_caption: "flex h-8 items-center justify-center",
        caption_label: "text-sm font-semibold",
        nav: "flex items-center gap-1",
        button_previous: "absolute left-1 size-8 rounded-md hover:bg-accent",
        button_next: "absolute right-1 size-8 rounded-md hover:bg-accent",
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground",
        week: "mt-2 flex w-full",
        day: "relative size-9 p-0 text-center text-sm",
        day_button:
          "size-9 rounded-md p-0 font-normal hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        range_start: "rounded-l-md",
        range_middle: "rounded-none bg-accent text-accent-foreground",
        range_end: "rounded-r-md",
        ...classNames,
      }}
      {...props}
    />
  );
}

export { Calendar };
