import type { ComponentProps } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Sheet = Dialog.Root
export const SheetTrigger = Dialog.Trigger
export const SheetClose = Dialog.Close
export const SheetTitle = Dialog.Title
export const SheetDescription = Dialog.Description

export function SheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Dialog.Content>) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
      <Dialog.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-[min(88vw,24rem)] flex-col gap-6 border-l border-border bg-card p-6 shadow-xl',
          className,
        )}
        {...props}
      >
        {children}
        <Dialog.Close
          className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Fechar menu"
        >
          <X className="size-5" aria-hidden="true" />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  )
}
