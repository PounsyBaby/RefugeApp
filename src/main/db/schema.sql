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
  motdepasse_hash   VARCHAR(255) NOT NULL,
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
DROP TRIGGER IF EXISTS trg_animal_date_arrivee_ins;
CREATE TRIGGER trg_animal_date_arrivee_ins
BEFORE INSERT ON animal
FOR EACH ROW
BEGIN
  IF NEW.date_arrivee > CURRENT_DATE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_arrivee ne peut pas être dans le futur';
  END IF;
END;

DROP TRIGGER IF EXISTS trg_animal_date_arrivee_upd;
CREATE TRIGGER trg_animal_date_arrivee_upd
BEFORE UPDATE ON animal
FOR EACH ROW
BEGIN
  IF NEW.date_arrivee > CURRENT_DATE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'date_arrivee ne peut pas être dans le futur';
  END IF;
END;

DROP TRIGGER IF EXISTS trg_evt_medical_dates_ins;
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
END;

DROP TRIGGER IF EXISTS trg_evt_medical_dates_upd;
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
END;

DROP TRIGGER IF EXISTS trg_check_age_adoption_ins;
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
END;

DROP TRIGGER IF EXISTS trg_check_age_adoption_upd;
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
END;

DROP TRIGGER IF EXISTS trg_set_animal_adopte_ins;
CREATE TRIGGER trg_set_animal_adopte_ins
AFTER INSERT ON adoption
FOR EACH ROW
BEGIN
  IF NEW.statut = 'finalisee' THEN
    UPDATE animal SET statut = 'adopte' WHERE id_animal = NEW.id_animal;
  END IF;
END;

DROP TRIGGER IF EXISTS trg_set_animal_adopte_upd;
CREATE TRIGGER trg_set_animal_adopte_upd
AFTER UPDATE ON adoption
FOR EACH ROW
BEGIN
  IF NEW.statut = 'finalisee' AND OLD.statut <> 'finalisee' THEN
    UPDATE animal SET statut = 'adopte' WHERE id_animal = NEW.id_animal;
  END IF;
END;

DROP TRIGGER IF EXISTS trg_reservation_one_active_ins;
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
END;

DROP TRIGGER IF EXISTS trg_reservation_one_active_upd;
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
END;

DROP TRIGGER IF EXISTS trg_no_overlap_animal_emplacement_ins;
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
END;

DROP TRIGGER IF EXISTS trg_no_overlap_animal_emplacement_upd;
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
END;

DROP TRIGGER IF EXISTS trg_no_overlap_placement_fa_ins;
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
END;

DROP TRIGGER IF EXISTS trg_no_overlap_placement_fa_upd;
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
END;

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
INSERT INTO utilisateur (nom, prenom, email, motdepasse_hash, role, actif)
VALUES ('Admin', 'Test', 'admin@test.com', '123456', 'admin', 1)
ON DUPLICATE KEY UPDATE motdepasse_hash = VALUES(motdepasse_hash), actif = VALUES(actif);
