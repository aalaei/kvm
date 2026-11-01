// components/FileManager/components/ViewHeader.tsx
interface ViewHeaderProps {
  title: string;
  description: string;
}

export default function ViewHeader({ title, description }: ViewHeaderProps) {
  return (
    <div className="space-y-0">
      <h2 className="text-lg leading-tight font-bold text-black dark:text-white">{title}</h2>
      <div className="text-sm leading-snug text-slate-600 dark:text-[#ffffff]">{description}</div>
    </div>
  );
}