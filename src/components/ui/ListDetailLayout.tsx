import React from 'react';
import { Card } from './Card';
import { SectionTitle } from './SectionTitle';
import { InlineAddInput } from './InlineAddInput';

interface ListDetailLayoutProps {
  listTitle: string;
  listSubtitle: string;
  listContent: React.ReactNode;
  detailContent: React.ReactNode;
  addInputPlaceholder?: string;
  addInputValue?: string;
  onAddInputChange?: (value: string) => void;
  onAdd?: () => void;
  addDisabled?: boolean;
  addButtonLabel?: string;
  addInputMaxLength?: number;
  /** If true, right panel stretches full height (e.g. when list has flex). */
  fullHeight?: boolean;
}

const LIST_HEADER_CLASS = 'p-4 border-b border-neon-cyan border-opacity-30 flex justify-between items-center flex-shrink-0';
/**
 * The list's own scroll when the layout does not fill its tab (RX groups, inside
 * the Digital tab): 70% of the window, like the Digital tab's other lists. It was
 * the window less a guessed 250px, which ignored where the list sat on the page.
 */
const LIST_SCROLL_CLASS = 'overflow-y-auto max-h-[70vh]';

export const ListDetailLayout: React.FC<ListDetailLayoutProps> = ({
  listTitle,
  listSubtitle,
  listContent,
  detailContent,
  addInputPlaceholder,
  addInputValue = '',
  onAddInputChange,
  onAdd,
  addDisabled = false,
  addButtonLabel = 'Add',
  addInputMaxLength,
  fullHeight = false,
}) => {
  const showAddRow =
    addInputPlaceholder != null &&
    onAddInputChange != null &&
    onAdd != null;

  // grid-rows-1 is one minmax(0, 1fr) row, which holds both panes to the tab's
  // height so each scrolls inside it. An auto row grows to the taller pane's
  // content instead: the Scan Lists editor made it 3,357px and the page
  // scrolled. Zones only fit because its editor's content can shrink.
  return (
    <div className={fullHeight ? 'grid grid-cols-2 grid-rows-1 gap-4 h-full' : 'grid grid-cols-2 gap-4'}>
      <div className={fullHeight ? 'flex flex-col h-full' : ''}>
        <Card padding="tight" className={fullHeight ? 'flex flex-col h-full border-neon-cyan' : ''}>
          <div className={LIST_HEADER_CLASS}>
            <div>
              <SectionTitle as="h3" size="md" bold>
                {listTitle}
              </SectionTitle>
              <p className="text-cool-gray text-xs mt-1">{listSubtitle}</p>
            </div>
            {showAddRow && (
              <InlineAddInput
                value={addInputValue!}
                onChange={onAddInputChange!}
                onSubmit={onAdd!}
                placeholder={addInputPlaceholder}
                disabled={addDisabled}
                maxLength={addInputMaxLength}
                buttonLabel={addButtonLabel}
              />
            )}
          </div>
          <div className={fullHeight ? 'flex-1 min-h-0 overflow-y-auto' : LIST_SCROLL_CLASS}>
            {listContent}
          </div>
        </Card>
      </div>
      <div className={fullHeight ? 'flex flex-col h-full min-w-0' : ''}>
        {detailContent}
      </div>
    </div>
  );
};
