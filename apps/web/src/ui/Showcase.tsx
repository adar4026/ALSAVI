import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import './showcase.css';
import {
  Badge,
  Banner,
  Button,
  Chip,
  ChipRow,
  Dialog,
  EmptyState,
  GroupedList,
  IconButton,
  ListRow,
  ProgressBar,
  ProgressRing,
  SearchField,
  SegmentedControl,
  Sheet,
  SheetController,
  Skeleton,
  Stat,
  StatGroup,
  Stepper,
  Surface,
  Switch,
  TextArea,
  TextField,
  Tile,
  ToastHost,
  toasts,
} from './index';

/**
 * Component showcase (TASK_036) — development only. Opened at `#/ui` on the
 * dev server (`main.tsx` loads it behind `import.meta.env.DEV`, so it is not
 * part of the production build or the service-worker precache). Every
 * component in its states; hover, pressed and focus are live.
 */
export function Showcase() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const applyTheme = (t: 'system' | 'light' | 'dark') => {
    setTheme(t);
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };

  return (
    <div className="app showcase">
      <header className="showcase-head">
        <h1 className="showcase-title">Компоненты ALSAVI</h1>
        <p className="showcase-lead">Витрина TASK_036 — только для разработки (`#/ui`).</p>
        <SegmentedControl
          legend="Тема витрины"
          legendHidden
          name="showcase-theme"
          options={[
            { value: 'system', label: 'Система' },
            { value: 'light', label: 'Светлая' },
            { value: 'dark', label: 'Тёмная' },
          ]}
          value={theme}
          onChange={applyTheme}
        />
      </header>

      <Section title="Button">
        <Row>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="tertiary">Tertiary</Button>
          <Button variant="destructive" icon="archive">
            Destructive
          </Button>
          <Button variant="danger">Danger</Button>
        </Row>
        <Row>
          <Button size="lg" iconEnd="arrow-right">
            Large
          </Button>
          <Button icon="plus">С иконкой</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </Row>
        <Button size="lg" block iconEnd="arrow-right">
          Block · large
        </Button>
      </Section>

      <Section title="IconButton">
        <Row>
          <IconButton icon="close" label="Закрыть" />
          <IconButton icon="sliders" label="Настройки" variant="filled" />
          <IconButton icon="plus" label="Добавить" variant="accent" />
          <IconButton icon="edit" label="Изменить" disabled />
        </Row>
      </Section>

      <Section title="Surface · Tile">
        <Surface variant="hero" title="Hero" action={<Button variant="tertiary">Действие</Button>}>
          <p className="showcase-text">Радиус 22, --elev-2.</p>
        </Surface>
        <Surface title="Card">
          <p className="showcase-text">Радиус 16, граница, --elev-1.</p>
          <Surface variant="inset">Inset на --surface-2</Surface>
        </Surface>
        <div className="showcase-grid">
          <Tile icon="target" label="Трудные слова" detail="7 слов" tone="warm" />
          <Tile icon="plus" label="Добавить слово" detail="в коллекцию" />
          <Tile icon="cards" label="Disabled" detail="пока нет" disabled />
        </div>
      </Section>

      <Section title="ListRow · GroupedList">
        <GroupedList title="Обучение" note="Подпись под группой.">
          <ListRow title="la ventanilla" lang="es" subtitle="окошко (в учреждении)" trailing={<Badge tone="accent">повторить</Badge>} onClick={() => toasts.show({ message: 'Строка нажата' })} />
          <ListRow title="el buzón" lang="es" subtitle="почтовый ящик" trailing="через 5 дн" selected onClick={() => {}} />
          <ListRow title="Без ограничения" trailing={<Switch aria-label="Без ограничения" defaultChecked />} />
          <ListRow title="Экспорт резервной копии" chevron onClick={() => {}} />
        </GroupedList>
      </Section>

      <Section title="TextField · SearchField">
        <Fields />
      </Section>

      <Section title="Switch · Stepper · SegmentedControl">
        <Controls />
      </Section>

      <Section title="Chip · Badge">
        <Chips />
        <Row>
          <Badge>нейтральный</Badge>
          <Badge tone="accent">Новое слово</Badge>
          <Badge tone="success">изучено</Badge>
          <Badge tone="warning">изучается</Badge>
          <Badge tone="danger">забыто 3 раза</Badge>
          <Badge tone="danger" count>
            7
          </Badge>
        </Row>
      </Section>

      <Section title="ProgressBar · ProgressRing · Stat">
        <ProgressBar value={3} max={12} size="sm" aria-label="Пример: 3 из 12" />
        <ProgressBar value={0.65} aria-label="Пример: 65 %" />
        <ProgressBar value={1} tone="success" aria-label="Пример: готово" />
        <Row>
          <ProgressRing value={32} max={41}>
            78%
          </ProgressRing>
          <ProgressRing value={1} max={4} size={56} />
        </Row>
        <StatGroup columns={3}>
          <Stat label="Точность" value="86%" detail="из 216 ответов" />
          <Stat label="Серия" value={7} unit="дней" detail="рекорд 9" />
          <Stat label="В очереди" value={12} detail="на сегодня" />
        </StatGroup>
      </Section>

      <Section title="Banner · Toast">
        <Banner tone="info" actions={<Button variant="secondary">Обновить</Button>}>
          Доступна новая версия ALSAVI.
        </Banner>
        <Banner tone="warning">Уведомления запрещены в настройках браузера.</Banner>
        <Banner tone="error" actions={<Button variant="secondary">Повторить</Button>}>
          Не удалось загрузить статистику.
        </Banner>
        <Banner tone="success">Резервная копия сохранена.</Banner>
        <Toasts />
      </Section>

      <Section title="Sheet · Dialog">
        <Overlays />
      </Section>

      <Section title="EmptyState · Skeleton">
        <Surface>
          <EmptyState brand icon="plus" title="Начнём с первого слова" text="Добавь слово — и оно сразу появится в очереди." action={<Button icon="plus">Добавить слово</Button>} />
        </Surface>
        <Surface>
          <EmptyState icon="search" title="Ничего не найдено" text="По запросу «fianzas» слов нет." action={<Button variant="secondary">Сбросить фильтры</Button>} />
        </Surface>
        <div className="showcase-grid">
          <Surface>
            <Skeleton variant="list" delay={0} />
          </Surface>
          <Surface>
            <Skeleton variant="stats" delay={0} />
          </Surface>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="showcase-section">
      <h2 className="showcase-section-title">{title}</h2>
      <div className="showcase-stack">{children}</div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="showcase-row">{children}</div>;
}

function Fields() {
  const [word, setWord] = useState('la práctica');
  const [query, setQuery] = useState('');
  return (
    <>
      <TextField label="Слово или фраза" lang="es" value={word} onChange={(e) => setWord(e.target.value)} placeholder="например, la práctica" />
      <TextField label="Перевод" placeholder="например, практика" hint="Обязательное поле." />
      <TextField label="Перевод" error="Введи перевод." defaultValue="" />
      <TextField label="Disabled" disabled defaultValue="нельзя изменить" />
      <TextArea label="Пример" placeholder="La práctica hace al maestro." />
      <SearchField value={query} onChange={setQuery} label="Поиск карточек" placeholder="Поиск: слово, перевод, пример" />
    </>
  );
}

function Controls() {
  const [on, setOn] = useState(true);
  const [limit, setLimit] = useState(20);
  const [period, setPeriod] = useState('7');
  return (
    <>
      <Row>
        <label className="showcase-inline">
          <Switch checked={on} onChange={(e) => setOn(e.target.checked)} /> Включено
        </label>
        <label className="showcase-inline">
          <Switch disabled /> Disabled
        </label>
      </Row>
      <Stepper label="Новых карточек в день" value={limit} min={0} max={999} onChange={setLimit} />
      <SegmentedControl
        legend="Тема"
        name="showcase-theme-demo"
        options={[
          { value: 'system', label: 'Как в системе' },
          { value: 'light', label: 'Светлая' },
          { value: 'dark', label: 'Тёмная' },
        ]}
        value="system"
        onChange={() => {}}
      />
      <SegmentedControl
        legend="Период"
        legendHidden
        fill={false}
        name="showcase-period"
        options={[
          { value: '7', label: '7 дней' },
          { value: '30', label: '30 дней' },
        ]}
        value={period}
        onChange={setPeriod}
      />
    </>
  );
}

function Chips() {
  const [status, setStatus] = useState('all');
  const filters: Array<[string, string, number]> = [
    ['all', 'Все', 41],
    ['due', 'К повторению', 7],
    ['new', 'Новые', 5],
    ['learning', 'Изучаются', 4],
    ['difficult', 'Трудные', 7],
    ['archived', 'Архив', 2],
  ];
  return (
    <>
      <ChipRow label="Состояние">
        {filters.map(([v, l, n]) => (
          <Chip key={v} pressed={status === v} count={n} onClick={() => setStatus(v)}>
            {l}
          </Chip>
        ))}
      </ChipRow>
      <Row>
        <Chip variant="tag" count={8}>
          #документы
        </Chip>
        <Chip variant="suggestion">+ глаголы</Chip>
        <Chip disabled>Disabled</Chip>
      </Row>
    </>
  );
}

function Toasts() {
  return (
    <>
      <Row>
        <Button variant="secondary" onClick={() => toasts.show({ message: 'Добавлено: la nevera' })}>
          Тост
        </Button>
        <Button
          variant="secondary"
          onClick={() => toasts.show({ message: 'la queja в архиве', action: { label: 'Вернуть', onAction: () => toasts.show({ message: 'Возвращено' }) } })}
        >
          Тост с действием
        </Button>
        <Button variant="tertiary" onClick={() => toasts.clear()}>
          Очистить
        </Button>
      </Row>
      <ToastHost placement="inline" />
    </>
  );
}

function Overlays() {
  const [dirty, setDirty] = useState(true);
  const dirtyRef = useRef(dirty);
  const [sheet] = useState(() => new SheetController({ hasUnsavedChanges: () => dirtyRef.current, confirmDiscard: true }));
  const phase = useSyncExternalStore(sheet.subscribe, sheet.getPhase);
  const [dialog, setDialog] = useState(false);
  dirtyRef.current = dirty;
  return (
    <>
      <Row>
        <Button variant="secondary" onClick={() => sheet.open()}>
          Открыть лист
        </Button>
        <Button variant="destructive" icon="archive" onClick={() => setDialog(true)}>
          В архив
        </Button>
        <label className="showcase-inline">
          <Switch checked={dirty} onChange={(e) => setDirty(e.target.checked)} /> Лист с несохранённым
        </label>
      </Row>
      <Sheet
        open={phase !== 'closed'}
        title="Изменить слово"
        onRequestClose={(reason) => sheet.requestClose(reason)}
        leading={
          <Button variant="tertiary" onClick={() => sheet.requestClose('cancel')}>
            Отмена
          </Button>
        }
        footer={
          <Button size="lg" block onClick={() => sheet.requestClose('done')}>
            Сохранить
          </Button>
        }
      >
        <div className="showcase-stack">
          <TextField label="Слово или фраза" lang="es" defaultValue="la ventanilla" />
          <TextField label="Перевод" defaultValue="окошко" />
        </div>
      </Sheet>
      <Dialog
        open={phase === 'confirming'}
        title="Отменить изменения?"
        message="Введённый текст не сохранится."
        confirmLabel="Отменить"
        cancelLabel="Продолжить"
        destructive
        onConfirm={() => sheet.discard()}
        onCancel={() => sheet.keepEditing()}
      />
      <Dialog
        open={dialog}
        title="Убрать «la ventanilla» в архив?"
        message="Слово исчезнет из повторений. История сохранится — вернуть можно из «Архива»."
        confirmLabel="Убрать"
        destructive
        onConfirm={() => {
          setDialog(false);
          toasts.show({ message: 'la ventanilla в архиве', action: { label: 'Вернуть', onAction: () => {} } });
        }}
        onCancel={() => setDialog(false)}
      />
    </>
  );
}

