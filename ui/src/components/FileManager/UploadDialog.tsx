import Modal from "@components/Modal";

interface UploadDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
}


export function UploadDialog({
  open,
  title,
  description,
  children,
}: UploadDialogProps) {
  
  return (
    <Modal open={open} onClose={() => undefined}>
      <div className="mx-auto max-w-xl px-4 transition-all duration-300 ease-in-out">
        <div className="pointer-events-auto relative w-full overflow-hidden rounded-lg bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-slate-800">
          <div className="space-y-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h2 className="text-lg leading-tight font-bold text-black dark:text-white">
                  {title}
                </h2>
                <div className="text-sm leading-snug text-slate-600 dark:text-[#ffffff]">
                  {description}
                </div>
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </Modal>
  );
}
