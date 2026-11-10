import type { SearchFilters } from '../../types';
import { ALL_CATALOGUE, SOFTWARE_OPEN, SOFTWARE_REUSE } from '../../utils/constants';
import {
  labels,
  getSortedCategories,
  getSortedScopes,
  getSortedDevelopmentStatuses,
} from '../../utils/i18n';
import { useVocabulary } from '../../hooks/useVocabulary';
import type { VocabularyTerm } from '../../types';
import { CatalogueFilters } from './CatalogueFilters';

const softwareTypes: [string, string][] = [
  [ALL_CATALOGUE, labels.all],
  [SOFTWARE_OPEN, labels.software[SOFTWARE_OPEN]],
  [SOFTWARE_REUSE, labels.software[SOFTWARE_REUSE]],
];

const categories = getSortedCategories();
const scopes = getSortedScopes();
const devStatuses = getSortedDevelopmentStatuses();

// Le voci dei filtri PNRR sono liste editoriali gestite dalla dashboard (API v2,
// /vocabularies). La chiave è il valore cercato nei features del publiccode.yml
// (PNRR/Misura/<chiave>, PNRR/Beneficiari/<chiave>); "Tutte"/"Tutti" = nessun filtro.
const ALL_MEASURES = 'Tutte';
const ALL_TARGETS = 'Tutti';

const measureOptions = (terms: VocabularyTerm[]): [string, string][] => [
  [ALL_MEASURES, ALL_MEASURES],
  ...terms.map((t): [string, string] => [t.key, t.labelIt ? `${t.key} - ${t.labelIt}` : t.key]),
];
const targetOptions = (terms: VocabularyTerm[]): [string, string][] => [
  [ALL_TARGETS, ALL_TARGETS],
  ...terms.map((t): [string, string] => [t.key, t.labelIt ?? t.key]),
];

function VocabularyFilter(props: {
  id: string;
  title: string;
  selected: string;
  toOptions: (terms: VocabularyTerm[]) => [string, string][];
  onChange: (value: string) => void;
}) {
  const { terms, error } = useVocabulary(props.id);
  if (error) {
    return (
      <div className="mb-3">
        <h4 className="h6">{props.title}</h4>
        <p className="small text-muted">{labels.software.filter_unavailable}</p>
      </div>
    );
  }
  if (!terms) return null;
  return (
    <CatalogueFilters
      title={props.title}
      options={props.toOptions(terms)}
      selected={props.selected}
      onChange={(val) => props.onChange(val as string)}
      capitalize={false}
      radio
    />
  );
}

interface Props {
  type: string;
  filters: SearchFilters;
  onTypeChange: (type: string) => void;
  onFiltersChange: (filters: SearchFilters) => void;
}

export function CatalogueFiltersPanel({ type, filters, onTypeChange, onFiltersChange }: Props) {
  const pnrrFilter: [string, string][] = [['1', labels.software.pnrr]];

  return (
    <>
      <CatalogueFilters
        title="PNRR"
        options={pnrrFilter}
        selected={filters.pnrr ? ['1'] : []}
        onChange={(val) => {
          const isPnrr = Array.isArray(val) ? val.includes('1') : val === '1';
          onFiltersChange({
            ...filters,
            pnrr: isPnrr,
            pnrrTargets: isPnrr ? filters.pnrrTargets : ALL_TARGETS,
            pnrrMeasures: isPnrr ? filters.pnrrMeasures : ALL_MEASURES,
          });
        }}
        capitalize={false}
      />
      <hr/>

      {filters.pnrr && (
        <>
          <VocabularyFilter
            id="pnrr-targets"
            title={labels.software.pnrr_targets}
            selected={filters.pnrrTargets}
            toOptions={targetOptions}
            onChange={(pnrrTargets) => onFiltersChange({ ...filters, pnrrTargets })}
          />
          <hr/>
          <VocabularyFilter
            id="pnrr-measures"
            title={labels.software.pnrr_measures}
            selected={filters.pnrrMeasures}
            toOptions={measureOptions}
            onChange={(pnrrMeasures) => onFiltersChange({ ...filters, pnrrMeasures })}
          />
          <hr/>
        </>
      )}

      <CatalogueFilters
        title={labels.software.type}
        options={softwareTypes}
        selected={type}
        onChange={(val) => onTypeChange(val as string)}
        radio
      />
      <hr/>
      <CatalogueFilters
        title={labels.software.categories}
        options={categories}
        selected={filters.categories}
        onChange={(val) => onFiltersChange({ ...filters, categories: val as string[] })}
      />
      <hr/>
      <CatalogueFilters
        title={labels.software.intended_audience}
        options={scopes}
        selected={filters.intendedAudiences}
        onChange={(val) => onFiltersChange({ ...filters, intendedAudiences: val as string[] })}
      />
      <hr/>
      <CatalogueFilters
        title={labels.software.development_status}
        options={devStatuses}
        selected={filters.developmentStatuses}
        onChange={(val) => onFiltersChange({ ...filters, developmentStatuses: val as string[] })}
      />
      <hr/>
    </>
  );
}
