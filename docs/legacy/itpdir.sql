# ************************************************************
# Sequel Pro SQL dump
# Version 4541
#
# http://www.sequelpro.com/
# https://github.com/sequelpro/sequelpro
#
# Host: 127.0.0.1 (MySQL 5.5.5-10.5.29-MariaDB)
# Database: itpdir
# Generation Time: 2026-06-25 17:09:54 +0000
# ************************************************************


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


# Dump of table alt_rsvp
# ------------------------------------------------------------

DROP TABLE IF EXISTS `alt_rsvp`;

CREATE TABLE `alt_rsvp` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` text DEFAULT NULL,
  `email` text DEFAULT NULL,
  `comments` text DEFAULT NULL,
  `driveby` tinyint(1) DEFAULT NULL,
  `1in1` tinyint(1) DEFAULT NULL,
  `fridaynightspeaker` tinyint(1) DEFAULT NULL,
  `petchakucha` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table alumni
# ------------------------------------------------------------

DROP TABLE IF EXISTS `alumni`;

CREATE TABLE `alumni` (
  `netid` varchar(50) NOT NULL DEFAULT '',
  `linked_info` text NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `emails` text DEFAULT NULL,
  UNIQUE KEY `netid` (`netid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table alumni_search_student_prefs
# ------------------------------------------------------------

DROP TABLE IF EXISTS `alumni_search_student_prefs`;

CREATE TABLE `alumni_search_student_prefs` (
  `netid` varchar(50) NOT NULL DEFAULT '',
  `preferences` text DEFAULT NULL,
  PRIMARY KEY (`netid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table auth
# ------------------------------------------------------------

DROP TABLE IF EXISTS `auth`;

CREATE TABLE `auth` (
  `netid` varchar(50) NOT NULL DEFAULT '',
  `token` text NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  UNIQUE KEY `netid` (`netid`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table barcodes
# ------------------------------------------------------------

DROP TABLE IF EXISTS `barcodes`;

CREATE TABLE `barcodes` (
  `university_id` varchar(9) NOT NULL,
  `barcode` char(8) NOT NULL,
  `version` decimal(2,0) NOT NULL,
  PRIMARY KEY (`university_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table checklist
# ------------------------------------------------------------

DROP TABLE IF EXISTS `checklist`;

CREATE TABLE `checklist` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `netid` varchar(11) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `json_info` text DEFAULT NULL,
  `ts` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table checklist_2021
# ------------------------------------------------------------

DROP TABLE IF EXISTS `checklist_2021`;

CREATE TABLE `checklist_2021` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `netid` varchar(11) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `json_info` text DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table checklist_2025
# ------------------------------------------------------------

DROP TABLE IF EXISTS `checklist_2025`;

CREATE TABLE `checklist_2025` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `netid` varchar(11) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `json_info` text DEFAULT NULL,
  `ts` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table info_field
# ------------------------------------------------------------

DROP TABLE IF EXISTS `info_field`;

CREATE TABLE `info_field` (
  `field_id` int(11) NOT NULL AUTO_INCREMENT,
  `info_id` int(11) NOT NULL DEFAULT 0,
  `itp_id` int(11) NOT NULL,
  `source_id` int(11) NOT NULL,
  `sfield_id` int(11) NOT NULL DEFAULT 0,
  `field_privacy_setting` int(2) NOT NULL DEFAULT 0,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `field_value` mediumtext NOT NULL,
  `update_by_user` tinyint(1) NOT NULL,
  PRIMARY KEY (`field_id`),
  KEY `info` (`info_id`),
  KEY `source_fields` (`info_id`,`field_id`),
  KEY `itp_id` (`itp_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table info_field_save
# ------------------------------------------------------------

DROP TABLE IF EXISTS `info_field_save`;

CREATE TABLE `info_field_save` (
  `field_id` int(11) NOT NULL AUTO_INCREMENT,
  `info_id` int(11) NOT NULL DEFAULT 0,
  `itp_id` int(11) NOT NULL,
  `source_id` int(11) NOT NULL,
  `sfield_id` int(11) NOT NULL DEFAULT 0,
  `field_privacy_setting` int(2) NOT NULL DEFAULT 0,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `field_value` mediumtext NOT NULL,
  `update_by_user` tinyint(1) NOT NULL,
  PRIMARY KEY (`field_id`),
  KEY `info` (`info_id`),
  KEY `source_fields` (`info_id`,`field_id`),
  KEY `itp_id` (`itp_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table info_field2
# ------------------------------------------------------------

DROP TABLE IF EXISTS `info_field2`;

CREATE TABLE `info_field2` (
  `field_id` int(11) NOT NULL AUTO_INCREMENT,
  `info_id` int(11) NOT NULL,
  `itp_id` int(11) NOT NULL,
  `source_id` int(11) NOT NULL,
  `sfield_id` int(11) NOT NULL,
  `field_privacy_setting` int(2) NOT NULL,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp(),
  `field_value` mediumtext NOT NULL,
  `update_by_user` tinyint(1) NOT NULL,
  PRIMARY KEY (`field_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table info_log
# ------------------------------------------------------------

DROP TABLE IF EXISTS `info_log`;

CREATE TABLE `info_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event_name` varchar(255) NOT NULL,
  `event_data` mediumtext NOT NULL,
  `itp_id` int(11) NOT NULL,
  `remote_addr` varchar(25) NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table info_source
# ------------------------------------------------------------

DROP TABLE IF EXISTS `info_source`;

CREATE TABLE `info_source` (
  `info_id` int(11) NOT NULL AUTO_INCREMENT,
  `source_id` int(11) NOT NULL DEFAULT 0,
  `itp_id` int(11) NOT NULL DEFAULT 0,
  `source_from_url` varchar(255) NOT NULL DEFAULT '',
  `source_avail_public` char(1) NOT NULL DEFAULT 'N',
  `source_avail_itp` char(1) NOT NULL DEFAULT 'N',
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `update_by_user` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`info_id`),
  KEY `person` (`itp_id`),
  KEY `person_source` (`itp_id`,`source_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table itp_view
# ------------------------------------------------------------

DROP VIEW IF EXISTS `itp_view`;

CREATE TABLE `itp_view` (
   `itp_id` INT(11) NOT NULL DEFAULT '0',
   `netid` VARCHAR(50) NOT NULL DEFAULT '',
   `university_id` VARCHAR(50) NOT NULL DEFAULT '',
   `official_firstname` VARCHAR(100) NOT NULL DEFAULT '',
   `official_lastname` VARCHAR(100) NOT NULL DEFAULT '',
   `current_status` VARCHAR(255) NULL DEFAULT NULL
) ENGINE=MyISAM;



# Dump of table LinkedInData
# ------------------------------------------------------------

DROP TABLE IF EXISTS `LinkedInData`;

CREATE TABLE `LinkedInData` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `net_id` varchar(255) DEFAULT NULL,
  `itp_first_name` varchar(255) DEFAULT NULL,
  `itp_last_name` varchar(255) DEFAULT NULL,
  `itp_picture` varchar(255) DEFAULT NULL,
  `itp_preferred_name` varchar(255) DEFAULT NULL,
  `itp_status` varchar(255) DEFAULT NULL,
  `year` int(11) DEFAULT NULL,
  `gender` varchar(255) DEFAULT NULL,
  `linkedin_first_name` varchar(255) DEFAULT NULL,
  `linkedin_last_name` varchar(255) DEFAULT NULL,
  `linkedin_formatted_name` varchar(255) DEFAULT NULL,
  `connect_distance` int(11) DEFAULT NULL,
  `number_connnections` int(11) DEFAULT NULL,
  `headline` varchar(255) DEFAULT NULL,
  `linkedin_picture` varchar(255) DEFAULT NULL,
  `public_profile` varchar(255) DEFAULT NULL,
  `standard_profile` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `place` varchar(255) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `company` varchar(255) DEFAULT NULL,
  `company_size` varchar(255) DEFAULT NULL,
  `company_type` varchar(255) DEFAULT NULL,
  `industry` varchar(255) DEFAULT NULL,
  `json` varchar(255) DEFAULT NULL,
  `in_group` varchar(255) DEFAULT NULL,
  `connected_to_chair` varchar(255) DEFAULT NULL,
  `updated` datetime DEFAULT NULL,
  `modified` datetime DEFAULT NULL,
  `itp_id` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `linkedin_id` varchar(255) DEFAULT NULL,
  `admissions_id` varchar(255) DEFAULT NULL,
  `educations` text DEFAULT NULL,
  `positions` text DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table links
# ------------------------------------------------------------

DROP TABLE IF EXISTS `links`;

CREATE TABLE `links` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `url` varchar(255) DEFAULT NULL,
  `netid` varchar(11) DEFAULT NULL,
  `tags` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table nyu_official
# ------------------------------------------------------------

DROP TABLE IF EXISTS `nyu_official`;

CREATE TABLE `nyu_official` (
  `itp_id` int(11) NOT NULL AUTO_INCREMENT,
  `netid` varchar(50) NOT NULL DEFAULT '',
  `university_id` varchar(50) NOT NULL DEFAULT '',
  `barcode` char(8) NOT NULL DEFAULT '',
  `official_firstname` varchar(100) NOT NULL DEFAULT '',
  `official_middlename` varchar(100) DEFAULT NULL,
  `official_lastname` varchar(100) NOT NULL DEFAULT '',
  `preferred_firstname` varchar(100) DEFAULT NULL,
  `preferred_middlename` varchar(100) DEFAULT NULL,
  `preferred_lastname` varchar(100) DEFAULT NULL,
  `gender` char(1) DEFAULT NULL,
  `classyear` varchar(4) DEFAULT NULL,
  `current_status` varchar(255) DEFAULT NULL,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `semester_last_registered` varchar(5) NOT NULL DEFAULT '0',
  `starting_semester` varchar(5) NOT NULL DEFAULT '0',
  `actual_grad_semester` varchar(5) NOT NULL DEFAULT '0',
  `actual_grad_date` varchar(8) NOT NULL DEFAULT '0',
  `starting_semester_int` int(11) NOT NULL DEFAULT 0,
  `semester_last_registered_int` int(11) NOT NULL DEFAULT 0,
  `actual_grad_year` int(11) NOT NULL DEFAULT 0,
  `login` varchar(25) NOT NULL DEFAULT '',
  `password` varchar(100) DEFAULT NULL,
  `censusID` int(6) NOT NULL DEFAULT 0,
  `token` varchar(255) NOT NULL DEFAULT '',
  `advisor` varchar(50) DEFAULT NULL,
  `school` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `pronouns` varchar(255) DEFAULT NULL,
  `advise_spreadsheet` varchar(255) DEFAULT NULL,
  `remoteness` varchar(255) DEFAULT NULL,
  `timezone` int(6) DEFAULT NULL,
  `citizenship` varchar(255) DEFAULT NULL,
  `no_shop` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`itp_id`),
  UNIQUE KEY `netid_unique` (`netid`),
  KEY `last_first` (`official_lastname`,`official_firstname`),
  KEY `first_last` (`official_firstname`,`official_lastname`),
  KEY `netid` (`netid`),
  KEY `nyu_official_no_shop` (`no_shop`),
  FULLTEXT KEY `netid_2` (`netid`,`official_firstname`,`official_lastname`,`preferred_firstname`,`preferred_lastname`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table nyu_official_copy
# ------------------------------------------------------------

DROP TABLE IF EXISTS `nyu_official_copy`;

CREATE TABLE `nyu_official_copy` (
  `itp_id` int(11) NOT NULL AUTO_INCREMENT,
  `netid` varchar(50) NOT NULL DEFAULT '',
  `university_id` varchar(50) NOT NULL DEFAULT '',
  `barcode` char(8) NOT NULL DEFAULT '',
  `official_firstname` varchar(100) NOT NULL DEFAULT '',
  `official_middlename` varchar(100) DEFAULT NULL,
  `official_lastname` varchar(100) NOT NULL DEFAULT '',
  `preferred_firstname` varchar(100) NOT NULL DEFAULT '',
  `preferred_middlename` varchar(100) DEFAULT NULL,
  `preferred_lastname` varchar(100) NOT NULL DEFAULT '',
  `gender` char(1) NOT NULL,
  `classyear` varchar(4) DEFAULT NULL,
  `current_status` varchar(255) DEFAULT NULL,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `semester_last_registered` varchar(5) NOT NULL,
  `starting_semester` varchar(5) NOT NULL,
  `actual_grad_semester` varchar(5) NOT NULL,
  `actual_grad_date` varchar(8) NOT NULL,
  `starting_semester_int` int(11) NOT NULL,
  `semester_last_registered_int` int(11) NOT NULL,
  `actual_grad_year` int(11) NOT NULL,
  `login` varchar(25) NOT NULL,
  `password` varchar(100) NOT NULL,
  `censusID` int(6) NOT NULL,
  `token` varchar(255) NOT NULL,
  `advisor` varchar(50) DEFAULT NULL,
  `school` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `pronouns` varchar(255) DEFAULT NULL,
  `advise_spreadsheet` varchar(255) DEFAULT NULL,
  `remoteness` varchar(255) DEFAULT NULL,
  `timezone` int(6) DEFAULT NULL,
  `citizenship` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`itp_id`),
  UNIQUE KEY `netid_unique` (`netid`),
  KEY `last_first` (`official_lastname`,`official_firstname`),
  KEY `first_last` (`official_firstname`,`official_lastname`),
  KEY `netid` (`netid`),
  FULLTEXT KEY `netid_2` (`netid`,`official_firstname`,`official_lastname`,`preferred_firstname`,`preferred_lastname`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table openid_mapping
# ------------------------------------------------------------

DROP TABLE IF EXISTS `openid_mapping`;

CREATE TABLE `openid_mapping` (
  `itp_id` int(10) NOT NULL,
  `identifier` varchar(500) NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`itp_id`,`identifier`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table rsvp
# ------------------------------------------------------------

DROP TABLE IF EXISTS `rsvp`;

CREATE TABLE `rsvp` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `session_id` varchar(255) NOT NULL,
  `firstname` varchar(100) NOT NULL,
  `lastname` varchar(100) NOT NULL,
  `company` varchar(255) NOT NULL,
  `companywww` varchar(255) NOT NULL,
  `address1` varchar(100) NOT NULL,
  `address2` varchar(100) NOT NULL,
  `city` varchar(100) NOT NULL,
  `state` varchar(2) NOT NULL,
  `zipcode` varchar(10) NOT NULL,
  `telephone` varchar(20) NOT NULL,
  `email` varchar(60) NOT NULL,
  `student_tix` int(5) NOT NULL,
  `general_tix` int(5) NOT NULL,
  `donation_non_rsvp` varchar(100) NOT NULL,
  `donation_other` varchar(100) NOT NULL,
  `processed_status` varchar(255) NOT NULL,
  `processed_trace_no` varchar(255) NOT NULL,
  `processed_id` varchar(255) NOT NULL,
  `processed_timestamp` varchar(255) NOT NULL,
  `processed_form_id` varchar(255) NOT NULL,
  `processed_fund_code_gft_1` varchar(255) NOT NULL,
  `processed_deptid_gft_1` varchar(255) NOT NULL,
  `processed_amount_gft_1` varchar(255) NOT NULL,
  `processed_amount_paid` varchar(255) NOT NULL,
  `processed_amount_evt` varchar(255) NOT NULL,
  `acknowledged` varchar(255) DEFAULT NULL,
  `total` int(10) DEFAULT NULL,
  `shirt_size` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `success` int(1) DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table sitemap
# ------------------------------------------------------------

DROP TABLE IF EXISTS `sitemap`;

CREATE TABLE `sitemap` (
  `id` int(20) unsigned NOT NULL AUTO_INCREMENT,
  `url` varchar(255) NOT NULL,
  `changefreq` varchar(50) NOT NULL DEFAULT 'weekly',
  `priority` varchar(3) DEFAULT '0.5',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;



# Dump of table source
# ------------------------------------------------------------

DROP TABLE IF EXISTS `source`;

CREATE TABLE `source` (
  `source_id` int(11) NOT NULL AUTO_INCREMENT,
  `source_name` varchar(255) NOT NULL DEFAULT '',
  `public_source_name` varchar(255) NOT NULL,
  `source_desc` varchar(255) NOT NULL DEFAULT '',
  `source_url` varchar(255) NOT NULL DEFAULT '',
  `source_template_path` varchar(255) NOT NULL DEFAULT '',
  `source_viewing_order` int(11) NOT NULL DEFAULT 0,
  `source_public` tinyint(1) NOT NULL DEFAULT 1,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`source_id`),
  KEY `source_title` (`source_name`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table source_field
# ------------------------------------------------------------

DROP TABLE IF EXISTS `source_field`;

CREATE TABLE `source_field` (
  `sfield_id` int(11) NOT NULL AUTO_INCREMENT,
  `source_id` int(11) NOT NULL DEFAULT 0,
  `sfield_desc` varchar(255) NOT NULL DEFAULT '',
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `sfield_name` varchar(255) NOT NULL DEFAULT '',
  `itpfield_name` varchar(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`sfield_id`),
  KEY `sfield_name` (`sfield_name`),
  KEY `source_fields` (`source_id`,`sfield_id`),
  KEY `source_fieldnames` (`source_id`,`sfield_name`),
  FULLTEXT KEY `itpfield_name` (`itpfield_name`),
  FULLTEXT KEY `sfield_name_2` (`sfield_name`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table unhallway_answers
# ------------------------------------------------------------

DROP TABLE IF EXISTS `unhallway_answers`;

CREATE TABLE `unhallway_answers` (
  `id` varchar(11) NOT NULL DEFAULT '',
  `data` text DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;



# Dump of table users_in_transition
# ------------------------------------------------------------

DROP TABLE IF EXISTS `users_in_transition`;

CREATE TABLE `users_in_transition` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `prev_last_name` varchar(100) NOT NULL,
  `netid` varchar(10) NOT NULL,
  `email` varchar(100) NOT NULL,
  `alumni_email` varchar(255) NOT NULL,
  `class_year` int(4) NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  `token` varchar(255) NOT NULL,
  `mapped_itp_id` int(10) NOT NULL,
  `confirmed` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci COMMENT='holds user information for past itp community having trouble';





# Replace placeholder table for itp_view with correct view syntax
# ------------------------------------------------------------

DROP TABLE `itp_view`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `itp_view`
AS SELECT
   `itpdir`.`nyu_official`.`itp_id` AS `itp_id`,
   `itpdir`.`nyu_official`.`netid` AS `netid`,
   `itpdir`.`nyu_official`.`university_id` AS `university_id`,
   `itpdir`.`nyu_official`.`official_firstname` AS `official_firstname`,
   `itpdir`.`nyu_official`.`official_lastname` AS `official_lastname`,
   `itpdir`.`nyu_official`.`current_status` AS `current_status`
FROM `nyu_official`;

/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
