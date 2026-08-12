/**
 * Réglages, rappels, export et sauvegarde (maquette 1n, spec §11.8, §10, §14).
 *
 * La licence de la BDPM impose de **mentionner la source et sa date de mise à
 * jour** (§6.6) : c'est cet écran qui les porte, avec le pied du relevé.
 *
 * ⚠ §10.2 — la couche calendrier est la **garantie**, le push est l'appoint.
 * Pour une pilule, le calendrier est activé par défaut et sa désactivation
 * demande une confirmation explicite.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { fenetreGlissante } from '../../domain/temps.js';
import type { Substance } from '../../domain/types.js';
import { baseDeDonnees } from '../../db/client.js';
import { genererIcs } from '../../services/ics.js';
import { genererReleve, imprimer } from '../../services/releve.js';
import {
  chiffrerArchive,
  dechiffrerArchive,
  enregistrer as enregistrerArchive,
} from '../../services/sauvegarde.js';
import type { ArchiveCarnet } from '../../db/depots.js';
import { abonner, publierCalendrier, pushDisponible } from '../../pwa/push.js';
import { plateforme } from '../../pwa/installation.js';
import { maintenant } from '../App.js';
import { FUSEAU, useMedco } from '../etat.js';
import { Bouton, Carte, Etiquette, TitreEcran } from '../composants/primitives.js';
import styles from '../composants/composants.module.css';

/** À renseigner au déploiement du Worker (voir `docs/deploiement.md`). */
const URL_WORKER = import.meta.env['VITE_URL_WORKER'] ?? '';

/**
 * Domaine des `UID` du calendrier.
 *
 * ⚠ Figé, et non déduit de `window.location` : un même carnet consulté depuis
 * une prévisualisation ou un domaine de repli produirait des `UID` différents,
 * et l'agenda de l'utilisateur récolterait des alarmes en double (§10.4).
 *
 * `.invalid` est réservé par la RFC 2606 : garanti non résolvable et détenu par
 * personne. Un `UID` n'a besoin que d'être unique, jamais d'être joignable —
 * y mettre un vrai domaine ne servirait qu'à le publier. Ne pas changer cette
 * valeur après la première diffusion d'un calendrier.
 */
const DOMAINE_CALENDRIER = 'medco.invalid';

export function Reglages(): ReactNode {
  const { regles, versionRegles, profilId, produits, prises } = useMedco();
  const [catalogue, setCatalogue] = useState<{ version: string; dateBdpm: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');
  const [lienCalendrier, setLienCalendrier] = useState<string | null>(null);
  const [effacer, setEffacer] = useState(false);
  const [restaurerArme, setRestaurerArme] = useState(false);

  useEffect(() => {
    void baseDeDonnees.versionCatalogue().then(setCatalogue);
  }, []);

  // --- Rappels ------------------------------------------------------------

  async function calendrier(): Promise<void> {
    if (!profilId) return;
    const instant = maintenant();
    const plans = await baseDeDonnees.plansDuProfil(profilId);
    const entrees = await Promise.all(
      plans.map(async (plan) => ({
        plan,
        sequence: await baseDeDonnees.sequenceDuPlan(plan.id),
        occurrences: await baseDeDonnees.occurrencesDuPlan(plan.id),
      })),
    );

    const ics = genererIcs(entrees, {
      domaine: DOMAINE_CALENDRIER,
      fuseau: FUSEAU(),
      maintenant: instant,
      nomCalendrier: 'Medco',
    });

    if (URL_WORKER) {
      const lien = await publierCalendrier(
        { urlWorker: URL_WORKER, identifiant: profilId, fuseau: FUSEAU(), slots: [], rrule: '' },
        ics,
      );
      setLienCalendrier(lien);
      return;
    }

    // Sans Worker déployé, l'export manuel reste le chemin. Sur Android,
    // l'avertissement de doublon est indispensable (§10.4).
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    lien.download = 'medco.ics';
    lien.click();
    URL.revokeObjectURL(lien.href);
    setMessage(
      plateforme() === 'android'
        ? "Fichier exporté. Supprimez l'ancien import dans votre agenda avant de charger celui-ci : Google Agenda ne remplace pas les alarmes, il les ajoute."
        : 'Fichier exporté.',
    );
  }

  async function rappelsPush(): Promise<void> {
    if (!profilId) return;
    if (!URL_WORKER) {
      setMessage("Le Worker de rappel n'est pas déployé : seule la couche calendrier est disponible.");
      return;
    }
    const plans = await baseDeDonnees.plansDuProfil(profilId);
    const heures = [...new Set(plans.flatMap((plan) => plan.heures ?? []))];
    const accepte = await abonner({
      urlWorker: URL_WORKER,
      identifiant: profilId,
      fuseau: FUSEAU(),
      slots: heures,
      rrule: 'FREQ=DAILY',
    });
    setMessage(
      accepte
        ? 'Rappels activés. Ils complètent le calendrier, ils ne le remplacent pas.'
        : 'Notifications refusées. Le calendrier reste la garantie.',
    );
  }

  // --- Relevé et sauvegarde ------------------------------------------------

  async function releve(): Promise<void> {
    if (!profilId) return;
    const instant = maintenant();
    const fenetre = fenetreGlissante(instant, 'P90D');
    const codes = [...new Set(prises.flatMap((prise) => prise.substances.map((s) => s.code)))];
    const substances = new Map(
      (await baseDeDonnees.substancesDuCatalogue(codes)) as unknown as [string, Substance][],
    );

    imprimer(
      genererReleve({
        profil: (await baseDeDonnees.profils()).find((p) => p.id === profilId)?.nom ?? 'Profil',
        debut: fenetre.debut,
        fin: instant,
        prises,
        produits,
        nomsSubstances: new Map([...substances].map(([code, s]) => [code, s.nom])),
        dateBdpm: catalogue?.dateBdpm ?? '',
        versionRegles,
        avecDetail: true,
      }),
    );
  }

  async function sauvegarder(): Promise<void> {
    if (phrase.length < 12) {
      setMessage('La phrase de passe doit compter au moins douze caractères.');
      return;
    }
    const instant = maintenant();

    // ⚠ Le carnet est lu **en base**, jamais depuis l'état de l'écran : celui-ci
    // ne tient que la fenêtre de travail et les produits actifs. Une archive
    // bâtie à partir de lui amputerait l'historique de tout ce qui la précède,
    // et ne le dirait pas.
    const carnet = await baseDeDonnees.exporterCarnet(instant);
    const contenu = new TextEncoder().encode(JSON.stringify(carnet));

    try {
      await enregistrerArchive(await chiffrerArchive(contenu, phrase, instant));
    } catch (cause) {
      // Le sélecteur de fichiers refermé sans choisir lève `AbortError`. Sans
      // ce message, l'écran ne dirait rien du tout — et l'utilisateur croirait
      // sa sauvegarde faite.
      setMessage(
        cause instanceof DOMException && cause.name === 'AbortError'
          ? 'Sauvegarde annulée : aucun fichier écrit.'
          : `La sauvegarde a échoué : ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      return;
    }

    const lignes = Object.values(carnet.tables).reduce((total, table) => total + table.length, 0);
    setPhrase('');
    setMessage(
      `Sauvegarde enregistrée : ${lignes} lignes, tout le carnet. Sans cette phrase de passe, elle est définitivement irrécupérable.`,
    );
  }

  async function restaurer(fichier: File): Promise<void> {
    if (phrase.length < 12) {
      setMessage('Saisissez d’abord la phrase de passe de la sauvegarde.');
      return;
    }
    setMessage('Déchiffrement en cours…');
    try {
      const clair = await dechiffrerArchive(new Uint8Array(await fichier.arrayBuffer()), phrase);
      const bilan = await baseDeDonnees.restaurerCarnet(
        JSON.parse(new TextDecoder().decode(clair)) as ArchiveCarnet,
      );
      setPhrase('');
      setMessage(`Carnet restauré : ${bilan.lignes} lignes. L’application va se recharger.`);
      // Tout l'état en mémoire décrit le carnet d'avant : on repart de zéro
      // plutôt que de rafraîchir écran par écran.
      window.setTimeout(() => window.location.reload(), 1500);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>Réglages</TitreEcran>

      {message ? (
        <Carte filet="information">
          <p className={styles['meta']}>{message}</p>
        </Carte>
      ) : null}

      <Carte>
        <Etiquette>Rappels</Etiquette>
        <p className={styles['meta']}>
          Le calendrier est la garantie : l&apos;alarme est gérée par votre téléphone, sans réseau.
          Les notifications viennent en complément, pour valider une prise en un appui.
        </p>
        <div style={{ display: 'grid', gap: 'var(--espace-5)', marginTop: 'var(--espace-8)' }}>
          <Bouton variante="secondaire" pleineLargeur onClick={() => void calendrier()}>
            {plateforme() === 'ios' ? "S'abonner au calendrier" : 'Exporter le calendrier (.ics)'}
          </Bouton>
          {lienCalendrier ? (
            <a className={styles['source']} href={lienCalendrier}>
              Ouvrir l&apos;abonnement dans Calendrier ↗
            </a>
          ) : null}
          <Bouton
            variante="secondaire"
            pleineLargeur
            disabled={!pushDisponible()}
            onClick={() => void rappelsPush()}
          >
            Activer les notifications
          </Bouton>
        </div>
      </Carte>

      <Carte>
        <Etiquette>Relevé de consommation</Etiquette>
        <p className={styles['meta']}>
          Quatre-vingt-dix jours, à imprimer ou enregistrer en PDF. Des chiffres et une méthode :
          aucune conclusion n&apos;y est tirée.
        </p>
        <div style={{ marginTop: 'var(--espace-8)' }}>
          <Bouton variante="secondaire" pleineLargeur onClick={() => void releve()}>
            Produire le relevé
          </Bouton>
        </div>
      </Carte>

      <Carte>
        <Etiquette>Sauvegarde chiffrée</Etiquette>
        <p className={styles['meta']}>
          Le fichier contient tout le carnet — profils, produits, prises, plans — chiffré par votre
          phrase de passe. Enregistrez-le hors du téléphone : un fichier resté sur l&apos;appareil
          disparaît avec lui.
        </p>
        <p className={styles['meta']}>
          ⚠ Une phrase de passe perdue rend l&apos;archive irrécupérable. Aucun mécanisme de
          récupération n&apos;existe, ni ne peut exister.
        </p>
        <input
          type="password"
          className={styles['champ']}
          value={phrase}
          placeholder="Phrase de passe (12 caractères minimum)"
          autoComplete="new-password"
          onChange={(evenement) => setPhrase(evenement.target.value)}
          style={{ marginTop: 'var(--espace-5)' }}
        />
        <div style={{ display: 'grid', gap: 'var(--espace-5)', marginTop: 'var(--espace-5)' }}>
          <Bouton variante="secondaire" pleineLargeur onClick={() => void sauvegarder()}>
            Enregistrer une sauvegarde
          </Bouton>

          {/* Une sauvegarde qu'on ne sait pas relire n'est pas une sauvegarde.
              L'`input` est masqué mais reste le seul sélecteur de fichiers
              disponible sur Android : `showOpenFilePicker` n'y existe pas. */}
          <input
            id="archive"
            type="file"
            accept=".medco,application/octet-stream"
            className={styles['fichierMasque']}
            onChange={(evenement) => {
              const fichier = evenement.target.files?.[0];
              evenement.target.value = '';
              if (fichier) void restaurer(fichier);
            }}
          />
          <Bouton
            variante="secondaire"
            pleineLargeur
            onClick={() => {
              if (!restaurerArme) {
                setRestaurerArme(true);
                setMessage(
                  'La restauration remplace le carnet de cet appareil par celui de la sauvegarde. Les prises enregistrées depuis sont perdues.',
                );
                return;
              }
              document.getElementById('archive')?.click();
            }}
          >
            {restaurerArme ? 'Confirmer : choisir le fichier' : 'Restaurer une sauvegarde'}
          </Bouton>
        </div>
      </Carte>

      <Carte>
        <Etiquette>Sources</Etiquette>
        <p>
          Données BDPM du{' '}
          {catalogue ? new Date(catalogue.dateBdpm).toLocaleDateString('fr-FR') : '—'}
        </p>
        <p className={styles['meta']}>
          Base de données publique des médicaments (ANSM · HAS · UNCAM), licence ouverte. Codes ATC
          issus d&apos;Open Medic (Assurance Maladie), licence ouverte. Données non altérées.
        </p>
        <a
          className={styles['source']}
          href="https://base-donnees-publique.medicaments.gouv.fr/telechargement"
          target="_blank"
          rel="noreferrer noopener"
        >
          base-donnees-publique.medicaments.gouv.fr ↗
        </a>
      </Carte>

      <Carte filet="information">
        <Etiquette>Effacer cet appareil</Etiquette>
        <p className={styles['meta']}>
          Le carnet vit dans le stockage privé du navigateur. Ni « vider le cache », ni la
          désinstallation de l&apos;application ne l&apos;effacent — c&apos;est ce qui le protège
          d&apos;une purge accidentelle, et ce qui rend ce bouton nécessaire.
        </p>
        <p className={styles['meta']}>
          Tout est supprimé : profils, produits, prises, plans et code. Sans retour possible.
        </p>
        <div style={{ marginTop: 'var(--espace-8)' }}>
          <Bouton
            variante="secondaire"
            pleineLargeur
            onClick={() => {
              if (effacer) {
                void baseDeDonnees.reinitialiser().then(() => window.location.reload());
                return;
              }
              setEffacer(true);
            }}
          >
            {effacer ? 'Confirmer : tout effacer' : 'Effacer cet appareil'}
          </Bouton>
        </div>
      </Carte>

      <Carte>
        <Etiquette>Mentions légales</Etiquette>
        <p className={styles['meta']}>
          Éditeur, hébergeur, nature de l&apos;application et traitement des données.
        </p>
        <Link className={styles['source']} to="/mentions-legales">
          Consulter les mentions légales →
        </Link>
      </Carte>

      <Carte>
        <Etiquette>Données</Etiquette>
        <p className={styles['meta']}>
          {regles.length} repères chargés (version {versionRegles || '—'}), chacun avec sa source
          datée. Tout est stocké sur cet appareil ; aucune donnée n&apos;est transmise, aucune
          télémétrie n&apos;existe.
        </p>
      </Carte>
    </main>
  );
}
