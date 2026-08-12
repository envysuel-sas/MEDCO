/**
 * Mentions légales — LCEN, article 6-III (loi n° 2004-575 du 21 juin 2004).
 *
 * Une application publiée par une société doit identifier son éditeur et son
 * hébergeur. Ce n'est pas une page de confort : son absence est sanctionnée.
 *
 * ⚠ Écran absent de la maquette : recomposé à partir des composants existants
 * (`TitreEcran`, `Carte`, `Etiquette`), sans motif visuel nouveau. Consigné
 * dans `docs/maquette/manques.md` §2.9.
 *
 * ⚠ Aucune valeur n'est inventée ici. Les champs vérifiés viennent du registre
 * national des entreprises ; **un champ vide n'est pas affiché** plutôt que de
 * porter une valeur plausible. Voir `IDENTITE` ci-dessous.
 */

import type { ReactNode } from 'react';

import { Carte, Etiquette, TitreEcran } from '../composants/primitives.js';
import styles from '../composants/composants.module.css';

/**
 * Identité de l'éditeur.
 *
 * Source des valeurs renseignées : registre national des entreprises,
 * `recherche-entreprises.api.gouv.fr`, consulté le 12/08/2026.
 *
 * ⚠ `capitalSocial` et `tvaIntracommunautaire` sont **vides et le restent**
 * tant qu'ils n'ont pas été confirmés :
 *
 *  · le capital social ne figure pas au registre consulté. Il est exigé par
 *    la LCEN : à relever sur le Kbis ;
 *  · le numéro de TVA se calcule depuis le SIREN, mais n'est dû que si la
 *    société est assujettie — ce qui n'a pas été vérifié.
 *
 * Une ligne vide n'est pas rendue. Mieux vaut une mention incomplète qu'une
 * mention fausse.
 */
const IDENTITE = {
  raisonSociale: 'ENVYSUEL',
  formeJuridique: 'Société par actions simplifiée (SAS)',
  capitalSocial: '',
  siren: '977 452 531',
  siret: '977 452 531 00022',
  rcs: 'R.C.S. Versailles 977 452 531',
  tvaIntracommunautaire: '',
  ape: '62.01Z — programmation informatique',
  adresse: '184 route de Rambouillet, 78125 Saint-Hilarion, France',
  directeurPublication: 'Robin Deboves, président',
} as const;

/** GitHub Pages sert l'application. L'hébergeur doit être nommé (LCEN 6-III). */
const HEBERGEUR = {
  nom: 'GitHub, Inc.',
  adresse: '88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis',
  site: 'https://github.com',
} as const;

function Ligne({ intitule, valeur }: { readonly intitule: string; readonly valeur: string }): ReactNode {
  // Un champ non confirmé ne s'affiche pas : il ne se comble pas.
  if (!valeur) return null;
  return (
    <p>
      <span className={styles['meta']} style={{ display: 'block' }}>
        {intitule}
      </span>
      <span style={{ display: 'block' }}>{valeur}</span>
    </p>
  );
}

export function MentionsLegales(): ReactNode {
  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>Mentions légales</TitreEcran>

      <Carte>
        <Etiquette>Éditeur</Etiquette>
        <Ligne intitule="Raison sociale" valeur={IDENTITE.raisonSociale} />
        <Ligne intitule="Forme juridique" valeur={IDENTITE.formeJuridique} />
        <Ligne intitule="Capital social" valeur={IDENTITE.capitalSocial} />
        <Ligne intitule="Siège social" valeur={IDENTITE.adresse} />
        <Ligne intitule="SIREN" valeur={IDENTITE.siren} />
        <Ligne intitule="SIRET (siège)" valeur={IDENTITE.siret} />
        <Ligne intitule="Immatriculation" valeur={IDENTITE.rcs} />
        <Ligne intitule="TVA intracommunautaire" valeur={IDENTITE.tvaIntracommunautaire} />
        <Ligne intitule="Code APE" valeur={IDENTITE.ape} />
        <Ligne intitule="Directeur de la publication" valeur={IDENTITE.directeurPublication} />
      </Carte>

      <Carte>
        <Etiquette>Hébergeur</Etiquette>
        <Ligne intitule="Dénomination" valeur={HEBERGEUR.nom} />
        <Ligne intitule="Adresse" valeur={HEBERGEUR.adresse} />
        <a className={styles['source']} href={HEBERGEUR.site} target="_blank" rel="noreferrer noopener">
          github.com ↗
        </a>
      </Carte>

      <Carte filet="information">
        <Etiquette>Nature de l&apos;application</Etiquette>
        <p className={styles['meta']}>
          Medco est un outil de suivi personnel. Il ne pose aucun diagnostic, ne délivre aucun
          conseil thérapeutique et ne remplace ni un médecin ni un pharmacien. Il n&apos;a fait
          l&apos;objet d&apos;aucun marquage CE en tant que dispositif médical et ne doit pas être
          utilisé comme tel.
        </p>
        <p className={styles['meta']}>
          Les repères affichés proviennent de sources publiques citées et datées ; ils ne
          constituent pas une prescription. En cas de doute sur une prise, sur un oubli ou sur un
          dosage, référez-vous à la notice du médicament ou consultez un professionnel de santé.
        </p>
      </Carte>

      <Carte>
        <Etiquette>Données personnelles</Etiquette>
        <p className={styles['meta']}>
          Aucune donnée n&apos;est collectée, transmise ni hébergée par l&apos;éditeur. Votre
          carnet — profils, produits, prises — est enregistré sur votre appareil et n&apos;en sort
          pas. Il n&apos;existe ni compte, ni synchronisation, ni télémétrie, ni mesure
          d&apos;audience, ni cookie.
        </p>
        <p className={styles['meta']}>
          Les notifications de rappel, si vous les activez, transitent par un service qui reçoit
          une heure et un contenu chiffré dont il n&apos;a pas la clé. Il ne peut pas savoir de
          quel traitement il s&apos;agit.
        </p>
        <p className={styles['meta']}>
          L&apos;éditeur ne détenant aucune donnée vous concernant, il ne peut ni vous la
          communiquer, ni la corriger, ni l&apos;effacer : vous en disposez directement depuis
          l&apos;application, dont la désinstallation suffit à tout supprimer.
        </p>
      </Carte>

      <Carte>
        <Etiquette>Propriété intellectuelle</Etiquette>
        <p className={styles['meta']}>
          L&apos;application, son code et sa direction visuelle sont la propriété de{' '}
          {IDENTITE.raisonSociale}. Tous droits réservés.
        </p>
        <p className={styles['meta']}>
          Les données médicamenteuses proviennent de la Base de données publique des médicaments
          (ANSM · HAS · UNCAM) et d&apos;Open Medic (Assurance Maladie), sous Licence Ouverte
          Etalab 2.0 : elles ne sont pas la propriété de l&apos;éditeur et restent librement
          réutilisables. Les polices Poppins, Newsreader et DM Mono sont sous SIL Open Font
          License 1.1.
        </p>
      </Carte>
    </main>
  );
}
