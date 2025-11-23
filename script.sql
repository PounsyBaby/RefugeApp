DROP DATABASE IF EXISTS refuge;
CREATE DATABASE refuge CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE refuge;

-- ====================
-- TABLES DE REFERENCE
-- ====================

CREATE TABLE personne (
  id_personne        BIGINT AUTO_INCREMENT PRIMARY KEY,
  nom                VARCHAR(255) NOT NULL,
  prenom             VARCHAR(255) NOT NULL,
  email              VARCHAR(255) NOT NULL,
  tel                VARCHAR(100),
  date_naissance     DATE,
  rue                VARCHAR(255),
  numero             VARCHAR(50),
  code_postal        VARCHAR(20),
  ville              VARCHAR(255),
  pays               VARCHAR(255),
  type_personne      ENUM('prospect','adoptant','fa','donateur','multiple'),
  UNIQUE KEY uq_personne_email (email)
) ENGINE=InnoDB;
ALTER TABLE personne
  ADD COLUMN jardin TINYINT(1) NULL AFTER date_naissance;

CREATE TABLE utilisateur (
  id_user           BIGINT AUTO_INCREMENT PRIMARY KEY,
  nom               VARCHAR(255) NOT NULL,
  prenom            VARCHAR(255) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  motdepasse_hash   VARCHAR(255) NOT NULL,         -- <== nécessaire pour le login
  role              ENUM('admin','agent','benevole','veto_ext') NOT NULL DEFAULT 'agent',
  actif             TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_utilisateur_email (email)
) ENGINE=InnoDB;

CREATE TABLE espece (
  id_espece  BIGINT AUTO_INCREMENT PRIMARY KEY,
  libelle    VARCHAR(255) NOT NULL,
  UNIQUE KEY uq_espece_libelle (libelle)
) ENGINE=InnoDB;

CREATE TABLE race (
  id_race    BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_espece  BIGINT NOT NULL,
  libelle    VARCHAR(255) NOT NULL,
  CONSTRAINT fk_race_espece FOREIGN KEY (id_espece)
    REFERENCES espece(id_espece) ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE KEY uq_race_espece_libelle (id_espece, libelle)
) ENGINE=InnoDB;

-- ==============
-- NOYAU ANIMAL
-- ==============

CREATE TABLE animal (
  id_animal           BIGINT AUTO_INCREMENT PRIMARY KEY,
  nom_usuel           VARCHAR(255),
  id_espece           BIGINT NOT NULL,
  sexe                ENUM('M','F','Inconnu'),
  date_naissance      DATE,
  date_arrivee        DATE NOT NULL,
  statut              ENUM('arrive','quarantaine','soin','adoptable','reserve','adopte','en_FA','transfere','decede','indisponible') NOT NULL DEFAULT 'arrive',
  couleur_robe        VARCHAR(255),
  poids_kg            DECIMAL(6,2),
  sterilise           TINYINT(1) NOT NULL DEFAULT 0,
  date_sterilisation  DATE,
  microchip_no        VARCHAR(255),
  description         TEXT,
  CONSTRAINT fk_animal_espece FOREIGN KEY (id_espece)
    REFERENCES espece(id_espece) ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE KEY uq_animal_microchip (microchip_no),
  KEY idx_animal_statut (statut),
  KEY idx_animal_espece (id_espece)
) ENGINE=InnoDB;

CREATE TABLE animal_race (
  id_animal   BIGINT NOT NULL,
  id_race     BIGINT NOT NULL,
  pourcentage INT,
  PRIMARY KEY (id_animal, id_race),
  CONSTRAINT fk_ar_animal FOREIGN KEY (id_animal)
    REFERENCES animal(id_animal) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_ar_race FOREIGN KEY (id_race)
    REFERENCES race(id_race) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE emplacement (
  id_emplacement  BIGINT AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(255) NOT NULL,
  type            VARCHAR(255) NOT NULL,
  capacite        INT NOT NULL,
  actif           TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_emplacement_code (code)
) ENGINE=InnoDB;

CREATE TABLE animal_emplacement (
  id_animal       BIGINT NOT NULL,
  id_emplacement  BIGINT NOT NULL,
  date_debut      DATE NOT NULL,
  date_fin        DATE,
  PRIMARY KEY (id_animal, date_debut),
  CONSTRAINT fk_ae_animal FOREIGN KEY (id_animal)
    REFERENCES animal(id_animal) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_ae_emplacement FOREIGN KEY (id_emplacement)
    REFERENCES emplacement(id_emplacement) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE entree (
  id_entree         BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_animal         BIGINT NOT NULL,
  date_entree       DATE NOT NULL,
  type              ENUM('abandon','trouve','saisie','transfert','autre') NOT NULL,
  source_personne   BIGINT,
  details           TEXT,
  CONSTRAINT fk_entree_animal FOREIGN KEY (id_animal)
    REFERENCES animal(id_animal) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_entree_source FOREIGN KEY (source_personne)
    REFERENCES personne(id_personne) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE veterinaire (
  id_vet        BIGINT AUTO_INCREMENT PRIMARY KEY,
  nom_cabinet   VARCHAR(255) NOT NULL,
  contact       VARCHAR(255),
  adresse       VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE evenement_medical (
  id_evt          BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_animal       BIGINT NOT NULL,
  type            ENUM('vaccin','vermifuge','test','chirurgie','consultation','traitement') NOT NULL,
  sous_type       VARCHAR(255),
  date_evt        DATE NOT NULL,
  date_validite   DATE,
  id_veterinaire  BIGINT,
  notes           TEXT,
  CONSTRAINT fk_evt_animal FOREIGN KEY (id_animal)
    REFERENCES animal(id_animal) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_evt_vet FOREIGN KEY (id_veterinaire)
    REFERENCES veterinaire(id_vet) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE note_comportement (
  id_note      BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_animal    BIGINT NOT NULL,
  date_note    DATE NOT NULL DEFAULT (CURRENT_DATE),
  ok_chiens    TINYINT(1),
  ok_chats     TINYINT(1),
  ok_enfants   TINYINT(1),
  score        INT,
  id_user      BIGINT NOT NULL,
  commentaire  TEXT,
  CONSTRAINT fk_nc_animal FOREIGN KEY (id_animal)
    REFERENCES animal(id_animal) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_nc_user FOREIGN KEY (id_user)
    REFERENCES utilisateur(id_user) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ==================
-- PROCESSUS ADOPTION
-- ==================

CREATE TABLE demande_adoption (
  id_demande          BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_personne         BIGINT NOT NULL,
  date_depot          DATE NOT NULL DEFAULT (CURRENT_DATE),
  statut              ENUM('soumise','en_etude','approuvee','refusee','expiree','annulee') NOT NULL DEFAULT 'soumise',
  type_logement       VARCHAR(255),
  jardin              TINYINT(1),
  accord_proprio      TINYINT(1),
  enfants             TINYINT(1),
  autres_animaux      VARCHAR(255),
  experience_animaux  TEXT,
  preferences         TEXT,
  commentaire         TEXT,
  CONSTRAINT fk_demande_pers FOREIGN KEY (id_personne)
    REFERENCES personne(id_personne) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_demande_statut (statut)
) ENGINE=InnoDB;

CREATE TABLE demande_animal (
  id_demande   BIGINT NOT NULL,
  id_animal    BIGINT NOT NULL,
  priorite     INT,
  PRIMARY KEY (id_demande, id_animal),
  CONSTRAINT fk_da_demande FOREIGN KEY (id_demande)
    REFERENCES demande_adoption(id_demande) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_da_animal FOREIGN KEY (id_animal)
    REFERENCES animal(id_animal) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE visite_domicile (
  id_visite   BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_demande  BIGINT NOT NULL,
  date_visite DATE NOT NULL,
  statut      ENUM('favorable','defavorable','conditionnel') NOT NULL,
  id_user     BIGINT NOT NULL,
  notes       TEXT,
  CONSTRAINT fk_vd_demande FOREIGN KEY (id_demande)
    REFERENCES demande_adoption(id_demande) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_vd_user FOREIGN KEY (id_user)
    REFERENCES utilisateur(id_user) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE rendez_vous (
  id_rdv       BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_personne  BIGINT NOT NULL,
  id_animal    BIGINT,
  date_heure   DATETIME NOT NULL,
  type         ENUM('visite','rencontre','adoption') NOT NULL,
  statut       ENUM('planifie','honore','annule','no_show') NOT NULL DEFAULT 'planifie',
  id_user      BIGINT NOT NULL,
  notes        TEXT,
  CONSTRAINT fk_rdv_pers FOREIGN KEY (id_personne)
    REFERENCES personne(id_personne) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_rdv_animal FOREIGN KEY (id_animal)
    REFERENCES animal(id_animal) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_rdv_user FOREIGN KEY (id_user)
    REFERENCES utilisateur(id_user) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Réservation
CREATE TABLE reservation (
  id_reservation  BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_animal       BIGINT NOT NULL,
  id_demande      BIGINT NOT NULL,
  date_debut      DATE NOT NULL,
  date_fin        DATE,
  statut          ENUM('active','expiree','annulee','convertie') NOT NULL DEFAULT 'active',
  motif           TEXT,
  KEY idx_reservation_animal (id_animal),
  KEY idx_reservation_demande (id_demande),
  CONSTRAINT fk_res_animal FOREIGN KEY (id_animal)
    REFERENCES animal(id_animal) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_res_demande FOREIGN KEY (id_demande)
    REFERENCES demande_adoption(id_demande) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE adoption (
  id_adoption         BIGINT AUTO_INCREMENT PRIMARY KEY,
  numero_contrat      VARCHAR(255) NOT NULL,
  id_animal           BIGINT NOT NULL,
  id_personne         BIGINT NOT NULL,
  date_contrat        DATE NOT NULL,
  frais_total         DECIMAL(10,2) NOT NULL DEFAULT 0,
  statut              ENUM('brouillon','finalisee','annulee','retour') NOT NULL DEFAULT 'brouillon',
  conditions_particulieres  TEXT,
  CONSTRAINT fk_adopt_animal FOREIGN KEY (id_animal)
    REFERENCES animal(id_animal) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_adopt_pers FOREIGN KEY (id_personne)
    REFERENCES personne(id_personne) ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE KEY uq_adoption_contrat (numero_contrat),
  INDEX idx_adoption_statut (statut)
) ENGINE=InnoDB;

CREATE TABLE paiement (
  id_paiement     BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_adoption     BIGINT NOT NULL,
  date_paiement   DATE NOT NULL DEFAULT (CURRENT_DATE),
  montant         DECIMAL(10,2) NOT NULL,
  mode            ENUM('especes','carte','virement') NOT NULL,
  reference       VARCHAR(255),
  CONSTRAINT fk_pay_adoption FOREIGN KEY (id_adoption)
    REFERENCES adoption(id_adoption) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE retour_post_adoption (
  id_retour     BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_adoption   BIGINT NOT NULL UNIQUE,
  date_retour   DATE NOT NULL,
  motif         VARCHAR(255),
  suite         ENUM('repropose','transfert','decede','autre'),
  commentaires  TEXT,
  CONSTRAINT fk_retour_adopt FOREIGN KEY (id_adoption)
    REFERENCES adoption(id_adoption) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE famille_accueil (
  id_fa           BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_personne     BIGINT NOT NULL,
  date_agrement   DATE NOT NULL,
  statut          ENUM('active','suspendue','terminee') NOT NULL DEFAULT 'active',
  notes           TEXT,
  CONSTRAINT fk_fa_personne FOREIGN KEY (id_personne)
    REFERENCES personne(id_personne) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE placement_fa (
  id_placement  BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_animal     BIGINT NOT NULL,
  id_fa         BIGINT NOT NULL,
  date_debut    DATE NOT NULL,
  date_fin      DATE,
  notes         TEXT,
  CONSTRAINT fk_pfa_animal FOREIGN KEY (id_animal)
    REFERENCES animal(id_animal) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pfa_fa FOREIGN KEY (id_fa)
    REFERENCES famille_accueil(id_fa) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE document (
  id_doc        BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_animal     BIGINT,
  id_adoption   BIGINT,
  id_demande    BIGINT,
  type_doc      VARCHAR(255) NOT NULL,
  uri           VARCHAR(512) NOT NULL,
  date_doc      DATE NOT NULL DEFAULT (CURRENT_DATE),
  CONSTRAINT fk_doc_animal FOREIGN KEY (id_animal)
    REFERENCES animal(id_animal) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_doc_adopt FOREIGN KEY (id_adoption)
    REFERENCES adoption(id_adoption) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_doc_demande FOREIGN KEY (id_demande)
    REFERENCES demande_adoption(id_demande) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- ==================
-- TRIGGERS (sans DECLARE)
-- ==================
DELIMITER $$

-- 1) Animal.date_arrivee pas dans le futur
DROP TRIGGER IF EXISTS trg_animal_date_arrivee_ins $$
CREATE TRIGGER trg_animal_date_arrivee_ins
BEFORE INSERT ON animal
FOR EACH ROW
BEGIN
  IF NEW.date_arrivee > CURRENT_DATE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_arrivee ne peut pas être dans le futur';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_animal_date_arrivee_upd $$
CREATE TRIGGER trg_animal_date_arrivee_upd
BEFORE UPDATE ON animal
FOR EACH ROW
BEGIN
  IF NEW.date_arrivee > CURRENT_DATE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_arrivee ne peut pas être dans le futur';
  END IF;
END $$

-- 2) Évènement médical : futur interdit + validité >= date_evt
DROP TRIGGER IF EXISTS trg_evt_medical_dates_ins $$
CREATE TRIGGER trg_evt_medical_dates_ins
BEFORE INSERT ON evenement_medical
FOR EACH ROW
BEGIN
  IF NEW.date_evt > CURRENT_DATE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_evt ne peut pas être dans le futur';
  END IF;
  IF NEW.date_validite IS NOT NULL AND NEW.date_validite < NEW.date_evt THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_validite doit être >= date_evt';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_evt_medical_dates_upd $$
CREATE TRIGGER trg_evt_medical_dates_upd
BEFORE UPDATE ON evenement_medical
FOR EACH ROW
BEGIN
  IF NEW.date_evt > CURRENT_DATE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_evt ne peut pas être dans le futur';
  END IF;
  IF NEW.date_validite IS NOT NULL AND NEW.date_validite < NEW.date_evt THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_validite doit être >= date_evt';
  END IF;
END $$

-- 3) Adoption : âge >= 18 ans (sans DECLARE)
DROP TRIGGER IF EXISTS trg_check_age_adoption_ins $$
CREATE TRIGGER trg_check_age_adoption_ins
BEFORE INSERT ON adoption
FOR EACH ROW
BEGIN
  IF (SELECT COUNT(*) FROM personne p
      WHERE p.id_personne = NEW.id_personne
        AND p.date_naissance IS NOT NULL) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Date de naissance manquante pour la personne';
  END IF;

  IF (SELECT COUNT(*) FROM personne p
      WHERE p.id_personne = NEW.id_personne
        AND TIMESTAMPDIFF(YEAR, p.date_naissance, NEW.date_contrat) >= 18) = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Adoptant doit avoir >= 18 ans à la date du contrat';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_check_age_adoption_upd $$
CREATE TRIGGER trg_check_age_adoption_upd
BEFORE UPDATE ON adoption
FOR EACH ROW
BEGIN
  IF NEW.id_personne <> OLD.id_personne OR NEW.date_contrat <> OLD.date_contrat THEN
    IF (SELECT COUNT(*) FROM personne p
        WHERE p.id_personne = NEW.id_personne
          AND p.date_naissance IS NOT NULL) = 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Date de naissance manquante pour la personne';
    END IF;

    IF (SELECT COUNT(*) FROM personne p
        WHERE p.id_personne = NEW.id_personne
          AND TIMESTAMPDIFF(YEAR, p.date_naissance, NEW.date_contrat) >= 18) = 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Adoptant doit avoir >= 18 ans à la date du contrat';
    END IF;
  END IF;
END $$

-- 4) Passage animal -> adopte
DROP TRIGGER IF EXISTS trg_set_animal_adopte_ins $$
CREATE TRIGGER trg_set_animal_adopte_ins
AFTER INSERT ON adoption
FOR EACH ROW
BEGIN
  IF NEW.statut = 'finalisee' THEN
    UPDATE animal SET statut = 'adopte' WHERE id_animal = NEW.id_animal;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_set_animal_adopte_upd $$
CREATE TRIGGER trg_set_animal_adopte_upd
AFTER UPDATE ON adoption
FOR EACH ROW
BEGIN
  IF NEW.statut = 'finalisee' AND OLD.statut <> 'finalisee' THEN
    UPDATE animal SET statut = 'adopte' WHERE id_animal = NEW.id_animal;
  END IF;
END $$

-- 5) Réservations : empêcher 2 'active' pour le même animal
DROP TRIGGER IF EXISTS trg_reservation_one_active_ins $$
CREATE TRIGGER trg_reservation_one_active_ins
BEFORE INSERT ON reservation
FOR EACH ROW
BEGIN
  IF NEW.statut = 'active' THEN
    IF (SELECT COUNT(*) FROM reservation r
        WHERE r.id_animal = NEW.id_animal AND r.statut = 'active') > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Déjà une réservation active pour cet animal';
    END IF;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_reservation_one_active_upd $$
CREATE TRIGGER trg_reservation_one_active_upd
BEFORE UPDATE ON reservation
FOR EACH ROW
BEGIN
  IF NEW.statut = 'active' AND (NEW.id_animal <> OLD.id_animal OR NEW.statut <> OLD.statut) THEN
    IF (SELECT COUNT(*) FROM reservation r
        WHERE r.id_animal = NEW.id_animal
          AND r.statut = 'active'
          AND r.id_reservation <> OLD.id_reservation) > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Déjà une réservation active pour cet animal';
    END IF;
  END IF;
END $$

-- 6) Chevauchements FA / Emplacements et incompatibilités
DROP TRIGGER IF EXISTS trg_no_overlap_animal_emplacement_ins $$
CREATE TRIGGER trg_no_overlap_animal_emplacement_ins
BEFORE INSERT ON animal_emplacement
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM animal_emplacement ae
     WHERE ae.id_animal = NEW.id_animal
       AND NOT (COALESCE(NEW.date_fin,'2999-12-31') < ae.date_debut
             OR COALESCE(ae.date_fin,'2999-12-31') < NEW.date_debut)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Chevauchement périodes (animal_emplacement)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM placement_fa pf
     WHERE pf.id_animal = NEW.id_animal
       AND (pf.date_fin IS NULL OR pf.date_fin >= NEW.date_debut)
       AND (NEW.date_fin IS NULL OR pf.date_debut <= NEW.date_fin)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Impossible: emplacement pendant FA active';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_no_overlap_animal_emplacement_upd $$
CREATE TRIGGER trg_no_overlap_animal_emplacement_upd
BEFORE UPDATE ON animal_emplacement
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM animal_emplacement ae
     WHERE ae.id_animal = NEW.id_animal
       AND NOT (COALESCE(NEW.date_fin,'2999-12-31') < ae.date_debut
             OR COALESCE(ae.date_fin,'2999-12-31') < NEW.date_debut)
       AND NOT (ae.id_animal = OLD.id_animal AND ae.date_debut = OLD.date_debut)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Chevauchement périodes (animal_emplacement)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM placement_fa pf
     WHERE pf.id_animal = NEW.id_animal
       AND (pf.date_fin IS NULL OR pf.date_fin >= NEW.date_debut)
       AND (NEW.date_fin IS NULL OR pf.date_debut <= NEW.date_fin)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Impossible: FA pendant un emplacement actif';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_no_overlap_placement_fa_ins $$
CREATE TRIGGER trg_no_overlap_placement_fa_ins
BEFORE INSERT ON placement_fa
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM placement_fa pf
     WHERE pf.id_animal = NEW.id_animal
       AND NOT (COALESCE(NEW.date_fin,'2999-12-31') < pf.date_debut
             OR COALESCE(pf.date_fin,'2999-12-31') < NEW.date_debut)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Chevauchement périodes (placement_fa)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM animal_emplacement ae
     WHERE ae.id_animal = NEW.id_animal
       AND (ae.date_fin IS NULL OR ae.date_fin >= NEW.date_debut)
       AND (NEW.date_fin IS NULL OR ae.date_debut <= NEW.date_fin)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Impossible: FA pendant un emplacement actif';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_no_overlap_placement_fa_upd $$
CREATE TRIGGER trg_no_overlap_placement_fa_upd
BEFORE UPDATE ON placement_fa
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM placement_fa pf
     WHERE pf.id_animal = NEW.id_animal
       AND NOT (COALESCE(NEW.date_fin,'2999-12-31') < pf.date_debut
             OR COALESCE(pf.date_fin,'2999-12-31') < NEW.date_debut)
       AND pf.id_placement <> OLD.id_placement
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Chevauchement périodes (placement_fa)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM animal_emplacement ae
     WHERE ae.id_animal = NEW.id_animal
       AND (ae.date_fin IS NULL OR ae.date_fin >= NEW.date_debut)
       AND (NEW.date_fin IS NULL OR ae.date_debut <= NEW.date_fin)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Impossible: FA pendant un emplacement actif';
  END IF;
END $$

DELIMITER ;

-- ==========
-- VUES
-- ==========
CREATE OR REPLACE VIEW v_animaux_adoptables AS
SELECT a.*
FROM animal a
WHERE a.statut IN ('adoptable','reserve');

CREATE OR REPLACE VIEW v_adoptions_a_finaliser AS
SELECT 
  ad.id_adoption,
  ad.numero_contrat,
  ad.id_animal,
  ad.id_personne,
  ad.date_contrat,
  ad.frais_total,
  ad.statut,
  ad.conditions_particulieres,
  IFNULL(p.total_paye,0) AS total_paye
FROM adoption ad
LEFT JOIN (
  SELECT id_adoption, SUM(montant) AS total_paye
  FROM paiement
  GROUP BY id_adoption
) p ON p.id_adoption = ad.id_adoption
WHERE ad.statut = 'brouillon';

-- ==================
-- DONNÉES DE TEST
-- ==================
-- Utilisateur de connexion pour tester l'app (mot de passe en clair POUR TEST UNIQUEMENT)
INSERT INTO utilisateur (nom, prenom, email, motdepasse_hash, role, actif)
VALUES ('Admin', 'Test', 'admin@test.com', '123456', 'admin', 1);

/* ============================
   DONNÉES DE RÉFÉRENCE
   ============================ */

-- Espèces
INSERT INTO espece (id_espece, libelle) VALUES
  (1, 'Chien'),
  (2, 'Chat');

-- Races de chiens
INSERT INTO race (id_race, id_espece, libelle) VALUES
  (1, 1, 'Berger Belge'),
  (2, 1, 'Berger Allemand'),
  (3, 1, 'Labrador Retriever'),
  (4, 1, 'Golden Retriever'),
  (5, 1, 'Border Collie'),
  (6, 1, 'Beagle'),
  (7, 1, 'Husky Sibérien'),
  (8, 1, 'Staffordshire Bull Terrier'),
  (9, 1, 'Chihuahua'),
  (10, 1, 'Shih Tzu');

-- Races de chats
INSERT INTO race (id_race, id_espece, libelle) VALUES
  (11, 2, 'Européen'),
  (12, 2, 'Siamois'),
  (13, 2, 'Maine Coon'),
  (14, 2, 'British Shorthair'),
  (15, 2, 'Bengal'),
  (16, 2, 'Ragdoll'),
  (17, 2, 'Persan'),
  (18, 2, 'Sphynx');


/* ============================
   PERSONNES (adoptants, FA...)
   ============================ */

INSERT INTO personne
(id_personne, nom, prenom, email, tel, date_naissance, jardin,
 rue, numero, code_postal, ville, pays, type_personne)
VALUES
  (1, 'Dupont', 'Jean', 'jean.dupont@example.com', '0470/11.22.33',
   '1990-05-10', 1, 'Rue des Lilas', '12', '6000', 'Charleroi', 'Belgique', 'adoptant'),

  (2, 'Martin', 'Sophie', 'sophie.martin@example.com', '0471/22.33.44',
   '1988-09-22', 1, 'Avenue des Rosiers', '5', '1190', 'Bruxelles', 'Belgique', 'adoptant'),

  (3, 'Leroy', 'Thomas', 'thomas.leroy@example.com', '0472/33.44.55',
   '1992-01-15', 1, 'Rue du Parc', '27', '6040', 'Jumet', 'Belgique', 'fa'),

  (4, 'Durand', 'Claire', 'claire.durand@example.com', '0473/44.55.66',
   '1985-07-03', 0, 'Rue des Écoles', '3', '6530', 'Thuin', 'Belgique', 'multiple'),

  (5, 'Lambert', 'Nicolas', 'nicolas.lambert@example.com', '0474/55.66.77',
   '1995-03-30', 1, 'Chaussée de Mons', '210', '6030', 'Marchienne-au-Pont', 'Belgique', 'prospect'),

  (6, 'Petit', 'Julie', 'julie.petit@example.com', '0475/66.77.88',
   '1993-11-11', 0, 'Rue Haute', '8', '7000', 'Mons', 'Belgique', 'donateur'),

  (7, 'Moreau', 'Alex', 'alex.moreau@example.com', '0476/77.88.99',
   '1990-02-02', 1, 'Rue du Centre', '15', '5000', 'Namur', 'Belgique', 'adoptant'),

  (8, 'Simon', 'Laura', 'laura.simon@example.com', '0477/88.99.00',
   '1987-12-20', 1, 'Rue de la Gare', '9', '4100', 'Seraing', 'Belgique', 'fa');


/* ============================
   UTILISATEURS (staff refuge)
   ============================ */

-- Admin de test déjà créé dans ton script (id_user = 1)
-- On ajoute quelques utilisateurs supplémentaires
INSERT INTO utilisateur
(id_user, nom, prenom, email, motdepasse_hash, role, actif)
VALUES
  (2, 'Agent', 'Refuge', 'agent@refuge.local', 'password', 'agent', 1),
  (3, 'Benevole', 'Marie', 'marie.benevole@refuge.local', 'password', 'benevole', 1);


/* ============================
   VÉTÉRINAIRES
   ============================ */

INSERT INTO veterinaire (id_vet, nom_cabinet, contact, adresse) VALUES
  (1, 'Clinique Vétérinaire du Centre', '071/12.34.56', 'Rue du Centre 45, 6000 Charleroi'),
  (2, 'VetPlus', '02/123.45.67', 'Boulevard Royal 10, 1000 Bruxelles');


/* ============================
   EMPLACEMENTS
   ============================ */

INSERT INTO emplacement
(id_emplacement, code, type, capacite, actif)
VALUES
  (1, 'Q1',   'Quarantaine', 5, 1),
  (2, 'B1',   'Box Chien 1', 2, 1),
  (3, 'B2',   'Box Chien 2', 2, 1),
  (4, 'CH1',  'Chatterie',   8, 1);


/* ============================
   ANIMAUX
   ============================ */

INSERT INTO animal
(id_animal, nom_usuel, id_espece, sexe, date_naissance, date_arrivee,
 statut, couleur_robe, poids_kg, sterilise, date_sterilisation, microchip_no, description)
VALUES
  (1, 'Rex',   1, 'M', '2021-03-15', '2024-09-01',
   'adoptable', 'marron', 22.50, 1, '2023-05-10', '900000000000001', 'Chien dynamique mais très sociable.'),

  (2, 'Lola',  1, 'F', '2020-07-10', '2024-08-15',
   'en_FA', 'noir et blanc', 18.30, 1, '2022-09-20', '900000000000002', 'Très douce, bonne avec les enfants.'),

  (3, 'Oslo',  1, 'M', '2022-01-05', '2024-10-01',
   'quarantaine', 'tricolore', 10.20, 0, NULL, '900000000000003', 'En observation sanitaire.'),

  (4, 'Nala',  2, 'F', '2022-02-02', '2024-09-20',
   'adoptable', 'tigré', 4.20, 0, NULL, '900000000000004', 'Chatte joueuse et curieuse.'),

  (5, 'Moka',  2, 'F', '2023-03-10', '2024-10-15',
   'soin', 'brown tabby', 3.10, 0, NULL, '900000000000005', 'En traitement pour légère infection.'),

  (6, 'Snow',  1, 'M', '2019-11-11', '2024-07-01',
   'arrive', 'blanc', 24.00, 1, '2022-01-15', '900000000000006', 'Chien calme, idéal première adoption.');


-- Liens Animal / Race
INSERT INTO animal_race (id_animal, id_race, pourcentage) VALUES
  (1, 3, 100),   -- Rex : Labrador
  (2, 4, 100),   -- Lola : Golden
  (3, 5, 100),   -- Oslo : Border Collie
  (4, 11, 100),  -- Nala : Européen
  (5, 13, 100),  -- Moka : Maine Coon
  (6, 2, 100);   -- Snow : Berger Allemand


/* ============================
   ENTRÉES ANIMAUX
   ============================ */

INSERT INTO entree
(id_entree, id_animal, date_entree, type, source_personne, details)
VALUES
  (1, 1, '2024-09-01', 'abandon', 1, 'Changement de situation familiale.'),
  (2, 2, '2024-08-15', 'abandon', 2, 'Manque de temps.'),
  (3, 3, '2024-10-01', 'trouve', NULL, 'Trouvé sur la voie publique.'),
  (4, 4, '2024-09-20', 'trouve', NULL, 'Chat errant sociable.'),
  (5, 5, '2024-10-15', 'trouve', NULL, 'Déposé par un voisin.'),
  (6, 6, '2024-07-01', 'abandon', 7, 'Déménagement à l\'étranger.');


/* ============================
   ANIMAL / EMPLACEMENTS
   ============================ */

INSERT INTO animal_emplacement
(id_animal, id_emplacement, date_debut, date_fin)
VALUES
  (1, 2, '2024-09-01', NULL),       -- Rex en box B1
  (2, 3, '2024-08-15', '2024-09-15'), -- Lola en box B2 puis FA
  (3, 1, '2024-10-01', NULL),       -- Oslo en quarantaine
  (4, 4, '2024-09-20', NULL),       -- Nala en chatterie
  (5, 4, '2024-10-15', NULL);       -- Moka en chatterie


/* ============================
   FAMILLES D’ACCUEIL & PLACEMENTS
   ============================ */

INSERT INTO famille_accueil
(id_fa, id_personne, date_agrement, statut, notes)
VALUES
  (1, 3, '2023-05-01', 'active', 'Grande maison avec jardin clôturé.'),
  (2, 8, '2022-09-15', 'active', 'Appartement calme, habituée aux chiens.');

-- Placement de Lola en FA (pas de chevauchement avec animal_emplacement)
INSERT INTO placement_fa
(id_placement, id_animal, id_fa, date_debut, date_fin, notes)
VALUES
  (1, 2, 1, '2024-09-16', NULL, 'Très bonne intégration dans la famille.');


/* ============================
   DEMANDES D’ADOPTION
   ============================ */

INSERT INTO demande_adoption
(id_demande, id_personne, date_depot, statut, type_logement, jardin,
 accord_proprio, enfants, autres_animaux, experience_animaux, preferences, commentaire)
VALUES
  (1, 1, '2024-10-01', 'en_etude', 'Maison 3 façades', 1, 1, 2,
   '1 chat', 'A déjà eu un chien', 'Chien moyen, calme', 'Visite prévue ce mois-ci.'),

  (2, 2, '2024-10-05', 'soumise', 'Appartement', 0, 1, 0,
   'Aucun', 'Première adoption', 'Chat adulte', 'Préférence pour chatte câline.'),

  (3, 7, '2024-10-10', 'soumise', 'Maison', 1, 1, 1,
   '1 chien', 'Bonne expérience', 'Chien sportif', 'Projet de cani-randonnée.');


INSERT INTO demande_animal (id_demande, id_animal, priorite) VALUES
  (1, 1, 1),  -- Jean veut Rex
  (2, 4, 1),  -- Sophie veut Nala
  (3, 1, 1),  -- Alex veut Rex
  (3, 3, 2);  -- en second choix Oslo


/* ============================
   VISITES DOMICILIAIRES & RDV
   ============================ */

INSERT INTO visite_domicile
(id_visite, id_demande, date_visite, statut, id_user, notes)
VALUES
  (1, 1, '2024-10-15', 'favorable', 2, 'Maison adaptée, jardin bien clôturé.'),
  (2, 2, '2024-10-18', 'conditionnel', 2, 'Balcon sécurisé à vérifier.');

INSERT INTO rendez_vous
(id_rdv, id_personne, id_animal, date_heure, type, statut, id_user, notes)
VALUES
  (1, 1, 1, '2024-10-12 14:00:00', 'rencontre', 'honore', 2, 'Bonne affinité avec Rex.'),
  (2, 2, 4, '2024-10-20 11:00:00', 'rencontre', 'planifie', 2, 'Première rencontre avec Nala.');


/* ============================
   ADOPTION & PAIEMENT
   ============================ */

-- Adoption de Snow par Alex (id_personne = 7)
INSERT INTO adoption
(id_adoption, numero_contrat, id_animal, id_personne, date_contrat,
 frais_total, statut, conditions_particulieres)
VALUES
  (1, 'CONTRAT-2024-0001', 6, 7, '2024-09-10',
   180.00, 'finalisee', 'Contrôle post-adoption dans 3 mois.');

-- Paiement complet
INSERT INTO paiement
(id_paiement, id_adoption, date_paiement, montant, mode, reference)
VALUES
  (1, 1, '2024-09-10', 180.00, 'carte', 'PAY-2024-0001');


/* ============================
   RÉSERVATION
   ============================ */

INSERT INTO reservation
(id_reservation, id_animal, id_demande, date_debut, date_fin, statut, motif)
VALUES
  (1, 4, 2, '2024-10-21', NULL, 'active', 'En attente de validation définitive.');


/* ============================
   ÉVÉNEMENTS MÉDICAUX
   ============================ */

INSERT INTO evenement_medical
(id_evt, id_animal, type, sous_type, date_evt, date_validite, id_veterinaire, notes)
VALUES
  (1, 1, 'vaccin', 'CHPPiL', '2024-09-05', '2025-09-05', 1, 'Vaccination annuelle.'),
  (2, 4, 'vaccin', 'Typhus/Coriza', '2024-09-25', '2025-09-25', 2, 'Rappel OK.'),
  (3, 5, 'traitement', 'Antibiotiques', '2024-10-18', '2024-11-01', 1, 'Suivi infection légère.');


/* ============================
   NOTES DE COMPORTEMENT
   ============================ */

INSERT INTO note_comportement
(id_note, id_animal, date_note, ok_chiens, ok_chats, ok_enfants,
 score, id_user, commentaire)
VALUES
  (1, 1, '2024-09-10', 1, 1, 1, 5, 2, 'Très sociable avec tout le monde.'),
  (2, 2, '2024-09-20', 0, 1, 1, 4, 3, 'Un peu craintive avec les autres chiens.'),
  (3, 4, '2024-09-25', 0, 1, 1, 5, 2, 'Adore les câlins, ok enfants.');


/* ============================
   DOCUMENTS
   ============================ */

INSERT INTO document
(id_doc, id_animal, id_adoption, id_demande, type_doc, uri, date_doc)
VALUES
  (1, 6, 1, NULL, 'contrat_adoption', '/docs/contrats/CONTRAT-2024-0001.pdf', '2024-09-10'),
  (2, 1, NULL, 1, 'formulaire_demande', '/docs/demandes/DEM-0001.pdf', '2024-10-01');